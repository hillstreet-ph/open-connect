# Release Policy

Trace production to Git SHA + version + Docker tag + immutable digest. Never use `latest` as the only production or rollback reference. Prefer staging verification followed by promotion of the same digest.
