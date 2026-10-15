# Application categories

Desktop Settings → Categories shows the actual `categories.json` path and opens its folder. The file lives beside `collection.json` in Tauri's application config directory, not beside the EXE or inside SQLite. It is initialized once from `packages/timeline/src/categories.default.json`; subsequent releases never replace an existing file. The browser preview uses these defaults without writing local files.

```json
{
  "version": 1,
  "categories": [
    { "id": "work", "name": "工作", "color": "#8094b8" },
    { "id": "development", "name": "开发", "parentId": "work" }
  ],
  "rules": [
    { "exe": "Code.exe", "categoryId": "development" }
  ]
}
```

Use stable unique IDs, optional single parents and six-digit hex colors. Categories inherit the nearest ancestor's color if their own is absent. Parent cycles and missing IDs are errors. Each normalized executable rule must be unique. Rules match case-insensitively; `\\` and `/` separators are equivalent. An exact full path overrides a basename rule. Rules do not currently inspect window titles or URLs. Unmatched apps belong to the built-in Uncategorized category (`__uncategorized` is reserved). No tags or multiple category memberships exist.

Save valid UTF-8 JSON (without comments; a UTF-8 BOM is accepted), then focus the client again. A valid configuration immediately reclassifies loaded history and subsequent queries without modifying the archive. Invalid files are left untouched; Settings shows the error and the current session retains its last valid config. On first load failure, shipped defaults remain active. Files over 1 MiB and more than 500 categories/5,000 rules are rejected. Range exports include the configuration snapshot and category totals used at export time.

Range Overview → Activity → Categories shows selection-clipped foreground active time excluding AFK. A parent's total includes its descendants: sum root totals only, not all displayed rows. Hover a parent for this reminder. Background lifetime and concurrent media time are not added to foreground category totals. Display → Color apps by category optionally changes app-lane colors for the session; ordinary app colors remain the default. Rules are application-level, so window-title changes do not split the foreground app lane. Desktop retains the full executable path for both exact-path rules and cached application icons while showing a short EXE name in tooltips. Editing UI, title-specific classification and category filtering remain separate follow-ups.
