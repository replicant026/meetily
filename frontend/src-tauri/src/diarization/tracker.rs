//! Online cosine-matching speaker tracker (Screenpipe/Talat-style).
//!
//! Maintains per-speaker centroids and a bounded example buffer. Each new
//! embedding is matched against all known speakers via cosine similarity.
//! Duration gates prevent short/noisy utterances from corrupting profiles.
//!
//! Reference: screenpipe embedding_manager.rs + identify_gate.rs

use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

pub struct TrackerConfig {
    /// Cosine similarity threshold for matching.
    pub match_threshold: f32,
    /// Hard cap on speaker count before force-merge.
    pub max_speakers: usize,
    /// Below this duration: skip identification entirely.
    pub min_identify_secs: f64,
    /// Below this duration: match only, do not update centroid/examples.
    pub min_learn_secs: f64,
    /// Max stored example embeddings per speaker.
    pub max_examples: usize,
    /// Centroid running-average weight cap (diminishing returns decay).
    pub centroid_weight_cap: usize,
}

impl Default for TrackerConfig {
    fn default() -> Self {
        Self {
            match_threshold: 0.35,
            max_speakers: 10,
            min_identify_secs: 1.0,
            min_learn_secs: 2.0,
            max_examples: 10,
            centroid_weight_cap: 50,
        }
    }
}

// ---------------------------------------------------------------------------
// Match result
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub enum MatchResult {
    /// Matched to an existing speaker.
    Matched {
        speaker_id: usize,
        label: String,
        confidence: f32,
    },
    /// New speaker created.
    NewSpeaker { speaker_id: usize, label: String },
    /// Duration too short — no identification attempted.
    Skipped,
    /// At max capacity — force-merged to closest centroid.
    ForceMerged {
        speaker_id: usize,
        label: String,
    },
}

#[derive(Debug, Clone)]
pub struct TrackerResult {
    pub match_result: MatchResult,
    pub embedding_duration: f64,
}

// ---------------------------------------------------------------------------
// SpeakerTracker
// ---------------------------------------------------------------------------

pub struct SpeakerTracker {
    /// speaker_id → centroid embedding (running average).
    centroids: HashMap<usize, Vec<f32>>,
    /// speaker_id → example embeddings (bounded buffer).
    examples: HashMap<usize, Vec<Vec<f32>>>,
    /// speaker_id → count of embeddings used for centroid (capped at weight_cap).
    counts: HashMap<usize, usize>,
    /// Next speaker ID to assign.
    next_id: usize,
    config: TrackerConfig,
}

impl Default for SpeakerTracker {
    fn default() -> Self {
        Self::new(TrackerConfig::default())
    }
}

impl SpeakerTracker {
    pub fn new(config: TrackerConfig) -> Self {
        Self {
            centroids: HashMap::new(),
            examples: HashMap::new(),
            counts: HashMap::new(),
            next_id: 0,
            config,
        }
    }

    /// Match an embedding against known speakers, or create a new speaker.
    ///
    /// Duration gates:
    /// - `< min_identify_secs` → Skipped
    /// - `[min_identify_secs, min_learn_secs)` → match only (no centroid update)
    /// - `>= min_learn_secs` → match + learn (update centroid + examples)
    pub fn match_or_create(&mut self, embedding: &[f32], duration_secs: f64) -> TrackerResult {
        if embedding.is_empty() {
            return TrackerResult {
                match_result: MatchResult::Skipped,
                embedding_duration: duration_secs,
            };
        }

        // Duration gate
        if duration_secs < self.config.min_identify_secs {
            return TrackerResult {
                match_result: MatchResult::Skipped,
                embedding_duration: duration_secs,
            };
        }

        let can_learn = duration_secs >= self.config.min_learn_secs;

        // Find best matching speaker
        if let Some((speaker_id, sim)) = self.find_best_match(embedding) {
            if sim >= self.config.match_threshold {
                let label = format!("Speaker {}", speaker_id + 1);
                if can_learn {
                    self.update_centroid(speaker_id, embedding);
                    self.add_example(speaker_id, embedding.to_vec());
                }
                return TrackerResult {
                    match_result: MatchResult::Matched {
                        speaker_id,
                        label,
                        confidence: sim,
                    },
                    embedding_duration: duration_secs,
                };
            }
        }

        // No match — create new or force-merge
        if self.centroids.len() < self.config.max_speakers {
            let id = self.next_id;
            self.next_id += 1;
            let label = format!("Speaker {}", id + 1);
            self.centroids.insert(id, embedding.to_vec());
            self.counts.insert(id, 1);
            if can_learn {
                self.examples.insert(id, vec![embedding.to_vec()]);
            }
            return TrackerResult {
                match_result: MatchResult::NewSpeaker {
                    speaker_id: id,
                    label,
                },
                embedding_duration: duration_secs,
            };
        }

        // At capacity — force-merge to closest
        let closest = self.find_closest(embedding);
        let label = format!("Speaker {}", closest + 1);
        if can_learn {
            self.update_centroid(closest, embedding);
            self.add_example(closest, embedding.to_vec());
        }
        TrackerResult {
            match_result: MatchResult::ForceMerged {
                speaker_id: closest,
                label,
            },
            embedding_duration: duration_secs,
        }
    }

    /// Compute cosine similarity between two embeddings.
    pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }
        dot / (norm_a * norm_b)
    }

    // -- Internal helpers --

    /// Find the best matching speaker: max of (centroid_sim, max_example_sims).
    fn find_best_match(&self, embedding: &[f32]) -> Option<(usize, f32)> {
        let mut best: Option<(usize, f32)> = None;

        for (&id, centroid) in &self.centroids {
            let mut max_sim = Self::cosine_similarity(embedding, centroid);

            // Also check stored examples
            if let Some(exs) = self.examples.get(&id) {
                for ex in exs {
                    let sim = Self::cosine_similarity(embedding, ex);
                    if sim > max_sim {
                        max_sim = sim;
                    }
                }
            }

            match &best {
                Some((_, prev)) if *prev >= max_sim => {}
                _ => best = Some((id, max_sim)),
            }
        }

        best
    }

    /// Find the centroid closest to the given embedding (for force-merge).
    fn find_closest(&self, embedding: &[f32]) -> usize {
        self.centroids
            .iter()
            .map(|(&id, centroid)| (id, Self::cosine_similarity(embedding, centroid)))
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(id, _)| id)
            .unwrap_or(0)
    }

    /// Update centroid with running average. Weight capped at `centroid_weight_cap`.
    fn update_centroid(&mut self, speaker_id: usize, embedding: &[f32]) {
        if let Some(centroid) = self.centroids.get_mut(&speaker_id) {
            if centroid.len() != embedding.len() {
                log::warn!(
                    "update_centroid: dimension mismatch for speaker {} (centroid={}, embedding={}), skipping",
                    speaker_id, centroid.len(), embedding.len()
                );
                return;
            }
            let count = self
                .counts
                .entry(speaker_id)
                .or_insert(1);
            let n = (*count).min(self.config.centroid_weight_cap) as f32;
            for i in 0..centroid.len() {
                centroid[i] = (centroid[i] * n + embedding[i]) / (n + 1.0);
            }
            *count += 1;
        }
    }

    /// Add example, rotating farthest-from-centroid when buffer is full.
    fn add_example(&mut self, speaker_id: usize, embedding: Vec<f32>) {
        let examples = self.examples.entry(speaker_id).or_default();
        if examples.len() < self.config.max_examples {
            examples.push(embedding);
        } else if let Some(centroid) = self.centroids.get(&speaker_id) {
            // Replace the example farthest from centroid (lowest cosine similarity)
            let replace_idx = examples
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| {
                    let sim_a = Self::cosine_similarity(a, centroid);
                    let sim_b = Self::cosine_similarity(b, centroid);
                    sim_a.partial_cmp(&sim_b).unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(idx, _)| idx)
                .unwrap_or(0);
            examples[replace_idx] = embedding;
        }
    }

    /// Get all centroids (for offline pass warm-start).
    pub fn centroids(&self) -> &HashMap<usize, Vec<f32>> {
        &self.centroids
    }

    /// Get current speaker count.
    pub fn speaker_count(&self) -> usize {
        self.centroids.len()
    }

    /// Reset for a new recording session.
    pub fn reset(&mut self) {
        self.centroids.clear();
        self.examples.clear();
        self.counts.clear();
        self.next_id = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_embedding(val: f32) -> Vec<f32> {
        vec![val; 256]
    }

    #[test]
    fn cosine_identical() {
        let a = make_embedding(1.0);
        assert!((SpeakerTracker::cosine_similarity(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_orthogonal() {
        let mut a = vec![0.0f32; 256];
        a[0] = 1.0;
        let mut b = vec![0.0f32; 256];
        b[1] = 1.0;
        assert!((SpeakerTracker::cosine_similarity(&a, &b)).abs() < 1e-6);
    }

    #[test]
    fn skip_short_duration() {
        let mut tracker = SpeakerTracker::new(TrackerConfig::default());
        let emb = make_embedding(1.0);
        let result = tracker.match_or_create(&emb, 0.5);
        assert!(matches!(result.match_result, MatchResult::Skipped));
    }

    #[test]
    fn new_speaker_on_first_embedding() {
        let mut tracker = SpeakerTracker::new(TrackerConfig::default());
        let emb = make_embedding(1.0);
        let result = tracker.match_or_create(&emb, 3.0);
        assert!(matches!(result.match_result, MatchResult::NewSpeaker { .. }));
        assert_eq!(tracker.speaker_count(), 1);
    }

    #[test]
    fn match_same_speaker() {
        let mut tracker = SpeakerTracker::new(TrackerConfig::default());
        let emb = make_embedding(1.0);
        tracker.match_or_create(&emb, 3.0);
        let result = tracker.match_or_create(&emb, 3.0);
        assert!(matches!(result.match_result, MatchResult::Matched { .. }));
        assert_eq!(tracker.speaker_count(), 1);
    }

    #[test]
    fn different_speakers() {
        let mut tracker = SpeakerTracker::new(TrackerConfig::default());
        let a = make_embedding(1.0);
        let mut b = make_embedding(0.0);
        b[0] = 1.0; // orthogonal
        tracker.match_or_create(&a, 3.0);
        let result = tracker.match_or_create(&b, 3.0);
        assert!(matches!(result.match_result, MatchResult::NewSpeaker { .. }));
        assert_eq!(tracker.speaker_count(), 2);
    }

    #[test]
    fn force_merge_at_capacity() {
        let config = TrackerConfig {
            max_speakers: 2,
            ..Default::default()
        };
        let mut tracker = SpeakerTracker::new(config);
        let a = make_embedding(1.0);
        let mut b = make_embedding(0.0);
        b[0] = 1.0;
        let mut c = make_embedding(0.0);
        c[1] = 1.0;

        tracker.match_or_create(&a, 3.0);
        tracker.match_or_create(&b, 3.0);
        let result = tracker.match_or_create(&c, 3.0);
        assert!(matches!(result.match_result, MatchResult::ForceMerged { .. }));
        assert_eq!(tracker.speaker_count(), 2);
    }

    #[test]
    fn match_only_no_learn() {
        let mut tracker = SpeakerTracker::new(TrackerConfig::default());
        let emb = make_embedding(1.0);
        tracker.match_or_create(&emb, 3.0);

        // Second embedding: duration between min_identify and min_learn
        let result = tracker.match_or_create(&emb, 1.5);
        assert!(matches!(result.match_result, MatchResult::Matched { .. }));
        // Count should not increase (no centroid update)
        assert_eq!(tracker.counts.get(&0), Some(&1));
    }

    #[test]
    fn reset_clears_state() {
        let mut tracker = SpeakerTracker::new(TrackerConfig::default());
        let emb = make_embedding(1.0);
        tracker.match_or_create(&emb, 3.0);
        assert_eq!(tracker.speaker_count(), 1);
        tracker.reset();
        assert_eq!(tracker.speaker_count(), 0);
    }
}
