---
phase: 3
plan: 2
wave: 1
redo: true
---

# Plan 3.2: Login UI Redesign (Iteration v2)

<objective>
Redesign the Login UI from the previous glassmorphism style to a professional, minimalist dark theme with high-contrast accent colors and improved accessibility.
</objective>

<context>
Load for context:
- .gsd/SPEC.md
- .gsd/ARCHIVE.md (Phase 3 History)
- frontend/src/pages/Login.js
- frontend/src/pages/Login.css
</context>

<tasks>

<task type="auto">
  <name>Apply Minimalist Dark Theme</name>
  <files>frontend/src/pages/Login.css</files>
  <action>
    Revise Login.css to remove excessive blur/transparency.
    - Use a deep charcoal background (#121212) for the card.
    - Use a vibrant accent color (#FF9F1C) for the primary button and focus states.
    - Implement subtle box-shadows instead of borders for a modern, layered look.
    - Ensure contrast ratios meet WCAG AA standards.
  </action>
  <verify>Check Login.css for new color tokens and removed backdrop-filter.</verify>
  <done>CSS reflects a minimalist high-contrast theme.</done>
</task>

<task type="auto">
  <name>Enhance Component Feedback</name>
  <files>frontend/src/pages/Login.js</files>
  <action>
    Update Login.js to add micro-animations for interaction.
    - Add hover/active states for the login button.
    - Improve error message visibility with a clear alert style.
    - Add a "Show password" toggle for better UX.
  </action>
  <verify>Navigating to /login and testing the new toggle.</verify>
  <done>UI is more interactive and user-friendly.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Login page no longer uses glassmorphism.
- [ ] Accessibility (contrast) is improved.
- [ ] Password toggle works as expected.
</verification>

<success_criteria>
- [ ] Redesign matches the "Minimalist Dark" objective.
- [ ] Functional parity with v1 preserved.
</success_criteria>
