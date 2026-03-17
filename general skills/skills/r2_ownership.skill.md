# R2 Ownership — MUST OBEY

- Keys must be uploads/<user_id>/...
- Ownership check MUST be:
  key.startsWith(`uploads/${userId}/`)
- FORBIDDEN:
  key.includes(userId)