---
name: Protected route auth
description: Session-check behavior for protected portal routes
---

Protected-route session checks should not retry unauthorized responses and should render a visible handoff while redirecting to sign-in.

**Why:** Repeated retries against the session endpoint made direct unauthenticated visits appear blank and delayed navigation.

**How to apply:** Keep the session query retry disabled in the route gate, and provide a visible loading or sign-in-required state before rendering protected page data.