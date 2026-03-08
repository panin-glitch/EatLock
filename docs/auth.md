# Authentication

EatLock uses Supabase Auth with anonymous-first sign-in.

## Flow

1. **App launch** → `ensureAuth()` checks for an existing session.
2. If no session, calls `supabase.auth.signInAnonymously()`.
3. User gets full functionality immediately (anonymous UUID).
4. Optionally they can **link an email** via Settings → Profile.

## Token Management

- Tokens are stored in Expo SecureStore via Supabase's `persistSession: true`.
- `autoRefreshToken: true` handles silent refresh.
- `getAccessToken()` returns current JWT or triggers `ensureAuth()`.

## API Authentication

`fetchWithAuth()` in `visionApi.ts` and `microsService.ts`:
1. Gets current JWT via `getBearerToken()`.
2. On 401 → calls `refreshAuthSession()`.
3. If refresh fails → returns the 401 response to the caller.
4. Callers surface session expiry instead of silently creating a new anonymous session.

## Email Operations

| Operation       | Function           | Notes                                    |
|----------------|--------------------|------------------------------------------|
| Sign up        | `signUp()`         | Email + password                         |
| Sign in        | `signIn()`         | Email + password                         |
| Reset password | `resetPassword()`  | Sends email to a secure HTTPS reset flow |
| Change email   | `updateEmail()`    | Sends confirmation to new address        |
| Change password| `updatePassword()` | Requires active session                  |

## Deep Links

- Scheme: `tadlock://`
- Password reset: HTTPS web reset flow (`EXPO_PUBLIC_PASSWORD_RESET_URL` when configured)

## Supabase Config

```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
