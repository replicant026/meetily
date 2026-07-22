
fn vec_repeating(v: &[f32], n: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(v.len() * n);
    for _ in 0..n {
        out.extend_from_slice(v);
    }
    out
}

use super::WindowedEmbedding;
use super::clustering::{cosine_affinity, remap_by_first_appearance, spectral_cluster};
use super::offline::aggregate_temporal_windows;

fn make_window(start: f64, end: f64, val: f32) -> WindowedEmbedding {
    WindowedEmbedding {
        audio_start: start,
        audio_end: end,
        vec: vec![val; 8],
    }
}

#[test]
fn three_speakers_separate() {
    let s1: Vec<f32> = vec_repeating(&[1.0, 0.0, 0.0], 8);
    let s2: Vec<f32> = vec_repeating(&[0.0, 1.0, 0.0], 8);
    let s3: Vec<f32> = vec_repeating(&[0.0, 0.0, 1.0], 8);
    let mut emb = vec![];
    for _ in 0..3 {
        emb.push(s1.clone());
    }
    for _ in 0..3 {
        emb.push(s2.clone());
    }
    for _ in 0..3 {
        emb.push(s3.clone());
    }
    let labels = spectral_cluster(&emb, 3);
    let remapped = remap_by_first_appearance(&labels);
    assert_eq!(remapped[0], remapped[1]);
    assert_eq!(remapped[1], remapped[2]);
    assert_ne!(remapped[0], remapped[3]);
    assert_ne!(remapped[0], remapped[6]);
}

#[test]
fn two_speakers_separate() {
    let s1: Vec<f32> = vec_repeating(&[1.0, 0.0], 5);
    let s2: Vec<f32> = vec_repeating(&[0.0, 1.0], 5);
    let mut emb = vec![];
    for _ in 0..4 {
        emb.push(s1.clone());
    }
    for _ in 0..4 {
        emb.push(s2.clone());
    }
    let labels = spectral_cluster(&emb, 2);
    let remapped = remap_by_first_appearance(&labels);
    for i in 0..4 {
        assert_eq!(remapped[i], remapped[0]);
    }
    for i in 4..8 {
        assert_ne!(remapped[i], remapped[0]);
    }
}

#[test]
fn affinity_diagonal_is_one() {
    let emb = vec![vec![1.0_f32, 0.0], vec![0.0, 1.0]];
    let m = cosine_affinity(&emb);
    assert!((m[(0, 0)] - 1.0).abs() < 1e-6);
    assert!((m[(1, 1)] - 1.0).abs() < 1e-6);
    // Orthogonal pair => clipped to 0
    assert!(m[(0, 1)] <= 0.0);
}

// -----------------------------------------------------------------------
// aggregate_temporal_windows tests
// -----------------------------------------------------------------------

#[test]
fn agg_empty_input() {
    let (agg, map) = aggregate_temporal_windows(&[], 192);
    assert!(agg.is_empty());
    assert!(map.is_empty());
}

#[test]
fn agg_below_limit_passthrough() {
    let windows: Vec<WindowedEmbedding> = (0..5).map(|i| make_window(i as f64, i as f64 + 1.0, i as f32)).collect();
    let (agg, map) = aggregate_temporal_windows(&windows, 192);
    assert_eq!(agg.len(), 5);
    assert_eq!(map.len(), 5);
    // Identity mapping
    for (i, &b) in map.iter().enumerate() {
        assert_eq!(i, b);
    }
}

#[test]
fn agg_group_size_clamped_at_least_one() {
    // 3 windows, max=192 → group_size = ceil(3/192) = 1 (via .max(1))
    let windows: Vec<WindowedEmbedding> = (0..3).map(|i| make_window(i as f64, i as f64 + 1.0, 1.0)).collect();
    let (agg, map) = aggregate_temporal_windows(&windows, 192);
    // 3 / 1 = 3 groups
    assert_eq!(agg.len(), 3);
    assert_eq!(map, vec![0, 1, 2]);
}

#[test]
fn agg_reduces_to_max() {
    // 10 windows → max=3 → group_size = ceil(10/3) = 4 → groups: [0..4],[4..8],[8..10]
    let windows: Vec<WindowedEmbedding> = (0..10).map(|i| make_window(i as f64, i as f64 + 1.0, i as f32)).collect();
    let (agg, map) = aggregate_temporal_windows(&windows, 3);
    assert_eq!(agg.len(), 3);
    assert_eq!(map.len(), 10);
    // Block boundaries: 0..4→0, 4..8→1, 8..10→2
    assert_eq!(&map[0..4], &[0, 0, 0, 0]);
    assert_eq!(&map[4..8], &[1, 1, 1, 1]);
    assert_eq!(&map[8..10], &[2, 2]);
}

#[test]
fn agg_mean_and_normalization() {
    // Two identical vectors → aggregated should equal normalized single vector
    let w1 = make_window(0.0, 1.0, 3.0);
    let w2 = make_window(1.0, 2.0, 3.0);
    let (agg, map) = aggregate_temporal_windows(&[w1, w2], 1);
    assert_eq!(agg.len(), 1);
    assert_eq!(map, vec![0, 0]);
    // mean = [3,3,...] → L2 norm = 3*sqrt(8) → each = 3/(3*sqrt(8)) = 1/sqrt(8)
    let expected = 1.0f32 / 8.0_f32.sqrt();
    for &v in &agg[0].vec {
        assert!((v - expected).abs() < 1e-5, "expected {}, got {}", expected, v);
    }
}

#[test]
fn agg_time_range_merged() {
    let w1 = make_window(0.0, 1.5, 1.0);
    let w2 = make_window(0.75, 2.25, 1.0);
    let w3 = make_window(1.5, 3.0, 1.0);
    let (agg, _) = aggregate_temporal_windows(&[w1, w2, w3], 1);
    assert_eq!(agg.len(), 1);
    assert!((agg[0].audio_start - 0.0).abs() < 1e-9);
    assert!((agg[0].audio_end - 3.0).abs() < 1e-9);
}
