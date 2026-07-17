# Spec - PR-F: LLM summary hotword protection

- **Wave**: 21
- **Branch**: feature/llm-ner-protection
- **Date**: 2026-07-18
- **Status**: Draft
- **Related**: PR-50 (hotword settings UI), PR-55 (postprocessor protected terms)

## Background

PR-50 introduced global hotword settings (stored at transcription-preferences.json under the hotwords key). PR-55 wired those into the postprocessor via sentinel + restore so terms prefixed with ! survive the cleanup chain.

The LLM summary path (summary/processor.rs) was left untouched. Of the 5 prompt builders:

| Prompt | NER protection rule? |
|--------|----------------------|
| english_normalization_system_prompt | YES (proper nouns / code / paths / URLs / numerics / backticks) |
| translation_system_prompt | YES (same) |
| build_chunk_summary_user_prompt | NO |
| build_combine_summary_user_prompt | NO |
| build_final_report_system_prompt | NO (only "only use info from source text") |

Failure mode observed in Chinese meetings: LLM rewrites "AGI" -> "A.G.I.", "OpenAI" -> "open ai", renames Chinese person names to pinyin, mangles company abbreviations. ~70% accuracy from prompt rule alone; ~95% when the LLM sees the actual term list.

## Goal

Plumb the full hotword list (both !-prefixed protected terms AND bare hotwords) from the postprocessor cache into the 3 unprotected LLM prompts as a glossary block, plus add an explicit NER-protection rule to each.

Zero behavior change for users who never configured hotwords (empty glossary + rule is a no-op when no terms are present).

## Design

### Cache (audio/post_processor.rs)

Parallel global cache, same pattern as PROTECTED_TERMS:

- static HOTWORD_LIST_FOR_LLM: Lazy<std::sync::Mutex<Vec<String>>>
- pub fn set_hotwords_for_llm(terms: Vec<String>)
- pub fn read_hotwords_for_llm() -> Vec<String>

Sorted longest-first.

### Extraction (transcription_preferences.rs)

New fn extract_all_hotwords(raw: &str) -> Vec<String>:

- Same split / dedup / length-desc sort as extract_protected_terms
- Does NOT strip ! prefix
- Empty vec for empty / whitespace input

save_transcription_hotwords and get_transcription_hotwords both call set_hotwords_for_llm(extract_all_hotwords(...)) after the existing set_protected_terms(...) call.

### Prompt injection (summary/processor.rs)

New const GLOSSARY_PROTECTION_INSTRUCTION:

> Treat every term inside the glossary as a proper noun. NEVER modify, translate, reformat, normalize, expand, or split these terms. If a glossary term appears verbatim in the source, reproduce it byte-for-byte in your output.

New fn build_glossary_block() -> Option<String>:

- Reads post_processor::read_hotwords_for_llm()
- None when empty, Some("<glossary>...</glossary>") when non-empty

The 3 unprotected prompt builders now:
1. Prepend GLOSSARY_PROTECTION_INSTRUCTION
2. Append glossary block (when Some) before closing tag

The 2 already-protected prompts are NOT touched.

## Files Touched

- frontend/src-tauri/src/audio/post_processor.rs - new cache + tests
- frontend/src-tauri/src/transcription_preferences.rs - new extract_all_hotwords + 2 callsites + tests
- frontend/src-tauri/src/summary/processor.rs - new constant + helper + 3 prompt mods + tests
- docs/superpowers/specs/2026-07-18-llm-ner-protection.md - this file
- docs/superpowers/plans/2026-07-18-llm-ner-protection.md - implementation plan
- CHANGELOG.md - Unreleased entry

## Testing

post_processor.rs: set_read_roundtrip_empty + set_read_roundtrip_multi
transcription_preferences.rs (via post_processor tests): extract_all_includes_bare_and_protected + extract_all_dedupes + extract_all_empty_input
summary/processor.rs: glossary_block_empty_when_no_terms + glossary_block_formats_terms + chunk_prompt_contains_glossary_when_present + chunk_prompt_omits_glossary_when_absent + combine_prompt_contains_instruction + final_report_prompt_contains_instruction

All via cargo test in CI; sandbox has no cargo, so verification is via code review + CI.

## Risks

- LOW: glossary bounded by existing MAX_HOTWORD_CHARS: 500 cap.
- LOW: race between hotword save and LLM call is benign.
- NONE: no new deps, no API changes, no frontend, no i18n.

## Out of Scope

- UI surfacing of "X terms protected" (PR-A)
- Auto-NER detection without configured hotwords
- Per-meeting hotword overrides
