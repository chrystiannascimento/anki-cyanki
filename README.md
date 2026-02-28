# Cyanki 🧠

Cyanki is an offline-first, continuous learning platform designed for high performance using the FSRS Algorithm and Gamification mechanisms.

## Changelog

### v0.0.1 (Current Version)
- **Offline-First Synchronization Engine (Dexie/IndexedDB)**: You can study fully offline and sync queue will intelligently merge changes with the server upon reconnection.
- **Spaced Repetition (FSRS)**: Automatic integration of the V4 FSRS algorithm scaling difficulty across Study Sessions.
- **Auto-Generated Flashcards**: Create continuous learning paths by documenting Notebooks. Cyanki will automatically track `Q: ... A: ...` patterns to build your deck!
- **Data Isolation & Security**: Real multi-tenant isolation. Your notes, your flashcards, safely enclosed in local PostgreSQL via FastAPI.
- **Public Community Notebooks**: Ability to mark specific Notebooks as Public and share them in the Community Tab with other learners!
- **Gamification**: XP tracking, Streak heatmaps, Levels and sound UI feedback designed to maintain study consistency.
- **Modern Interactive Dashboard**: Smooth TailwindCSS-driven UI with cross-device tracking features.
