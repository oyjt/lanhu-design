# Changelog

## Unreleased

- Move the installable skill into `skills/lanhu-design/` so repository-only files are kept out of the skill package when subdirectory installs are supported.
- Move the self-check script to `tests/self_check.mjs` and update local validation commands.
- Fix duplicate slice extraction when walking nested Lanhu layer data.
- Escape generated HTML text and attributes in DDS and Sketch/Figma conversion output.
- Require real `scale_urls` for non-2x and multi-density slice downloads instead of copying one `download_url` into multiple scale files.
- Ignore local secret files such as `.env` and `.claude/settings.json`.
