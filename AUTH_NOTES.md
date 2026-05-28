# coacheseyeGPT Auth Notes

This MVP uses lightweight mock login so the coach/player workflow can be tested today without setting up Firebase credentials.

## Test Accounts

| Role | Name | Email | Phone | PIN |
|---|---|---|---|---|
| Coach | Coach Simon | `coach@coachseye.test` | `+32470000001` | `1111` |
| Player | Simon Dodd | `simon@coachseye.test` | `+32470380938` | `2222` |
| Player | Alexis Choda | `alexis@coachseye.test` | `+32470000002` | `3333` |

## Current MVP Behaviour

- Coach accounts can access Coach View and Player View.
- Player accounts are locked to Player View.
- Player accounts can only update their own availability.
- Player availability responses create persistent coach inbox messages.
- All state is saved in browser storage with a backup key.

## Production Auth Direction

Firebase Auth is the preferred next step:

- Coaches sign in with email/password or club SSO later.
- Players sign in with phone OTP or email magic link.
- Each Firebase Auth user gets a `role` claim or role document.
- Player users are mapped to exactly one `players/{playerId}` profile.
- Coach users are mapped to one or more `clubs/{clubId}` records.

