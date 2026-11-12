# 06.1 deferred items (out of scope for the plan that found them)

## Found during 06.1-32 Task 1

- `.maestro/back-stays-short.yaml` (line 7) and `.maestro/save-offline.yaml` (lines 7, 28) still tap `"Activity, tab, 2 of 3"`. With Decide and Grow on, the tab bar has 4 tabs, so the label is now "Activity, tab, 2 of 4" and these two flows fail at their first tap. Fix: use `"Activity, tab, 2 of [0-9]"` as `record-as-bought.yaml` and `common/undo-latest.yaml` now do. Not changed in 06.1-32 because neither flow is in its file list.
