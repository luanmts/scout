# Selective Harvey contact-discovery reuse

Scout reuses the conservative public-site contact rules from
`ethanplusai/harvey` at commit `55866a1830ea73b7d96127b10dc7ad38b838a663`:

- the published company-inbox priority used by `harvey/agents/scout.py`;
- the executable-markup stripping boundary used by `harvey/collectors/profile.py`.

The rules are integrated into the existing TypeScript Contact Discovery flow.
They do not create a Harvey queue, database, campaign pipeline, or paid email
verification path. Harvey's named-address pattern generation and SMTP/API
verification are intentionally not imported because this flow must not invent
addresses or require paid services.

The original project's MIT notice is preserved in `LICENSE`.
