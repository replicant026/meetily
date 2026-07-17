// Wave 22 / PR-A: per-hotword hit-rate counter.
//
// Persists how often each configured hotword fires during ASR so the
// settings UI can show which entries are carrying weight and which are
// dead. Match: whole-word, case-insensitive. CJK characters count as
// word characters so word boundaries only fire on ASCII punctuation /
// whitespace or string ends.

use crate::transcription_preferences;
use once_cell::sync::{Lazy, OnceCell};
use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

static POOL: OnceCell<SqlitePool> = OnceCell::new();
static RAW: Lazy<std::sync::Mutex<String>> = Lazy::new(|| std::sync::Mutex::new(String::new()));

#[derive(Debug, Clone, Serialize)]
pub struct HitStatRow {
    pub hotword: String,
    pub hit_count: i64,
    pub last_hit_at: String,
}

pub fn init(pool: SqlitePool) {
    let _ = POOL.set(pool);
}

pub fn cache_raw(raw: &str) {
    if let Ok(mut g) = RAW.lock() {
        *g = raw.to_string();
    }
}

fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}Z", secs)
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-'
}

fn contains_whole_word_ci(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let h: Vec<char> = haystack.to_lowercase().chars().collect();
    let n: Vec<char> = needle.to_lowercase().chars().collect();
    let mut i = 0;
    while i + n.len() <= h.len() {
        let start_ok = i == 0 || !is_word_char(h[i - 1]);
        let end_idx = i + n.len();
        let end_ok = end_idx == h.len() || !is_word_char(h[end_idx]);
        if start_ok && end_ok && h[i..end_idx] == n[..] {
            return true;
        }
        i += 1;
    }
    false
}

async fn upsert_hits(pool: &SqlitePool, hits: &HashSet<String>) {
    if hits.is_empty() {
        return;
    }
    let now = now_iso();
    for term in hits {
        let _ = sqlx::query(
            "INSERT INTO hotword_hit_stats (hotword, hit_count, last_hit_at) \
             VALUES (?1, 1, ?2) \
             ON CONFLICT(hotword) DO UPDATE SET \
             hit_count = hit_count + 1, last_hit_at = excluded.last_hit_at"
        )
        .bind(term)
        .bind(&now)
        .execute(pool)
        .await;
    }
}

async fn run_record(pool: &SqlitePool, text: &str) {
    let raw = RAW.lock().map(|g| g.clone()).unwrap_or_default();
    let terms = transcription_preferences::extract_all_hotwords(&raw);
    if terms.is_empty() {
        return;
    }
    let mut hits: HashSet<String> = HashSet::new();
    for term in &terms {
        if contains_whole_word_ci(text, term) {
            hits.insert(term.clone());
        }
    }
    upsert_hits(pool, &hits).await;
}

pub async fn record_segment(text: &str) {
    if text.trim().is_empty() {
        return;
    }
    let pool = match POOL.get() {
        Some(p) => p,
        None => return,
    };
    run_record(pool, text).await;
}

pub async fn record_segments_batch(texts: &[String]) {
    let pool = match POOL.get() {
        Some(p) => p,
        None => return,
    };
    for t in texts {
        if !t.trim().is_empty() {
            run_record(pool, t).await;
        }
    }
}

pub async fn get_stats() -> Result<Vec<HitStatRow>, String> {
    let pool = POOL
        .get()
        .ok_or_else(|| "Hotword stats not initialized".to_string())?;
    let rows: Vec<(String, i64, String)> = sqlx::query_as(
        "SELECT hotword, hit_count, last_hit_at FROM hotword_hit_stats \
         ORDER BY hit_count DESC, hotword ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query hotword_hit_stats: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|(h, c, t)| HitStatRow {
            hotword: h,
            hit_count: c,
            last_hit_at: t,
        })
        .collect())
}

pub async fn cleanup_old(days: u32) -> Result<usize, String> {
    let pool = POOL
        .get()
        .ok_or_else(|| "Hotword stats not initialized".to_string())?;
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cutoff = format!(
        "{}Z",
        now_secs.saturating_sub(days as u64 * 86_400)
    );
    let res = sqlx::query("DELETE FROM hotword_hit_stats WHERE last_hit_at < ?1")
        .bind(&cutoff)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to cleanup old hotword stats: {}", e))?;
    Ok(res.rows_affected() as usize)
}

#[tauri::command]
pub async fn get_hotword_hit_stats() -> Result<Vec<HitStatRow>, String> {
    get_stats().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_word_case_insensitive_basic() {
        assert!(contains_whole_word_ci("we ship OpenAI here", "openai"));
        assert!(contains_whole_word_ci("OPENAI!", "openai"));
        assert!(contains_whole_word_ci("OpenAI公司", "OpenAI公司"));
    }

    #[test]
    fn whole_word_substring_excluded() {
        assert!(!contains_whole_word_ci("we ship openais here", "openai"));
        assert!(!contains_whole_word_ci("星河项目周报", "星河"));
    }

    #[test]
    fn whole_word_empty_needle_returns_false() {
        assert!(!contains_whole_word_ci("anything", ""));
    }
}
