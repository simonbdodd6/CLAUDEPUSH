# Identity Platform

Universal identity foundation for the Travel Intelligence Platform.

This module deliberately does not implement authentication providers. It owns the
canonical identity model that future authentication, SSO, federation, enterprise,
moderation, trust, business, AI-agent, and traveller systems can attach to.

Core API:

- `createIdentity`
- `readIdentity`
- `updateProfile`
- `changeRole`
- `setVerificationStatus`
- `suspendIdentity`
- `softDeleteIdentity`
- `getAuditEvents`

The repository is adapter-based so production storage can replace the in-memory
adapter without changing the domain API.

