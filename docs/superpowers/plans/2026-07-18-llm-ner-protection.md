# Plan - PR-F: LLM summary hotword protection

- Spec: docs/superpowers/specs/2026-07-18-llm-ner-protection.md
- Branch: feature/llm-ner-protection
- Single commit: yes

## Step 1 - post_processor.rs cache

Add HOTWORD_LIST_FOR_LLM global cache + set_hotwords_for_llm + read_hotwords_for_llm. Mirror the existing PROTECTED_TERMS pattern.

Insert location: immediately after the existing read_protected_terms() block.

Estimated: ~22 lines including 4-line doc comment.

## Step 2 - transcription_preferences.rs extraction

Add extract_all_hotwords(raw) -> Vec<String> next to extract_protected_terms. Mirror body but skip the strip_prefix step so !-prefixed entries are kept.

Two callsites in save_transcription_hotwords and get_transcription_hotwords. Both call set_hotwords_for_llm(extract_all_hotwords(raw)) after the existing set_protected_terms line.

Keep extract_all_hotwords private; put its tests inside transcription_preferences.rs.

Estimated: ~18 lines for the function + 2 callsites + 3 inline tests.

## Step 3 - summary/processor.rs prompt injection

Add GLOSSARY_PROTECTION_INSTRUCTION constant and build_glossary_block() helper near the other prompt-related constants.

GLOSSARY_PROTECTION_INSTRUCTION: short paragraph telling the LLM to treat glossary terms as proper nouns and never modify / translate / reformat them.

build_glossary_block: reads post_processor::read_hotwords_for_llm(); returns None when empty, Some(...) with glossary wrapper when non-empty.

Modify the 3 unprotected prompt builders:
- build_chunk_summary_user_prompt: prepend GLOSSARY_PROTECTION_INSTRUCTION and append glossary before closing tag
- build_combine_summary_user_prompt: same pattern
- build_final_report_system_prompt: prepend + append

The 2 already-protected prompts are NOT touched.

Estimated: ~30 lines including constant + helper + 3 prompt mods + 6 tests.

## Step 4 - tests

post_processor.rs test module:
- set_read_roundtrip_empty
- set_read_roundtrip_multi

transcription_preferences.rs (new inline tests):
- extract_all_includes_bare_and_protected
- extract_all_dedupes
- extract_all_empty_input

summary/processor.rs (new tests at bottom of file):
- glossary_block_empty_when_no_terms
- glossary_block_formats_terms
- chunk_prompt_contains_glossary_when_present
- chunk_prompt_omits_glossary_when_absent
- combine_prompt_contains_instruction
- final_report_prompt_contains_instruction

## Step 5 - CHANGELOG + commit

Append to CHANGELOG.md Unreleased section under Added.

Commit (single): feat(summary): inject hotword glossary into LLM prompts (PR-F)

Files in commit:
- frontend/src-tauri/src/audio/post_processor.rs
- frontend/src-tauri/src/transcription_preferences.rs
- frontend/src-tauri/src/summary/processor.rs
- CHANGELOG.md
- docs/superpowers/specs/2026-07-18-llm-ner-protection.md
- docs/superpowers/plans/2026-07-18-llm-ner-protection.md

## Out-of-scope reminders

- PR-A (hotword UI term-frequency + hit-rate stats) - separate
- Per-meeting hotword overrides - separate decision
- Auto-NER detection without configured hotwords - separate decision
