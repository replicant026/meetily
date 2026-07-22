
fn vec_repeating(v: &[f32], n: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(v.len() * n);
    for _ in 0..n {
        out.extend_from_slice(v);
    }
    out
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
