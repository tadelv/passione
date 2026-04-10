# TODO

Tracked items for future work.

## Pending

- [ ] **Weather widget** — Open-Meteo integration for idle screen layout (LOW priority)
- [ ] **Move descaling to Settings** — currently no entry point after removal from profile selector BottomBar. Add a "Maintenance" section in Settings with descaling wizard link.
- [ ] **Shot history sort controls** — ReaPrime API only supports `orderBy: [timestamp]`. Needs API expansion or client-side sort.
- [ ] **Steam calibration dialog** — blocked on ReaPrime orchestration API
- [ ] **AI dialing assistant** — deferred per project decision
- [ ] **Profile editors: styled confirm dialog** — ProfileEditorPage and RecipeEditorPage use browser `confirm()` for unsaved changes. Should use the same styled confirm overlay as SimpleProfileEditorPage and PostShotReviewPage.

## Done (v0.3.0)

- [x] Phase Timeline view on EspressoPage
- [x] Simple Profile Editor (settings_2a/2b)
- [x] Auto-Favorites page
- [x] Phase Summary Panel on shot detail/review
- [x] Cup Fill visualization
- [x] API alignment (annotations, machine states, server-side search)
- [x] Status bar redesign (clock, temps, water level)
- [x] Remove gauge/preset widgets (replaced by status bar + combos)
- [x] Remove BrewDialog (incompatible with GHC machines)
- [x] Weight flow chart line
