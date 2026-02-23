# UI Next Update Notes

Safe-area and device best-practice placeholder for next iteration:

- Use `padding-top: env(safe-area-inset-top)` and `padding-bottom: env(safe-area-inset-bottom)` on fixed/sticky bars.
- Keep tap targets at least 44x44 px and avoid placing key controls inside unsafe edges.
- Test iOS Safari, Android Chrome, and standalone PWA mode for notch/home-indicator behavior.
- Respect reduced-motion preference for animations (`prefers-reduced-motion`).
- Validate keyboard overlap behavior for fixed bottom navigation and any input fields.

Current release intentionally moves forward without this full safe-area matrix pass.
