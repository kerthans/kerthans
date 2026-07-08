# Profile maintenance

## Update current projects

Edit `profile.yml`, then push to `main`. `profile-sync.yml` renders the
generated README regions and commits `README.md` when those regions change.

## Local validation

```bash
npm ci
npm run profile:render
npm run profile:check
npm run profile:audit
```

## Generated regions

Do not manually edit content between `PROFILE:*:START` and `PROFILE:*:END`
markers. Those regions are rendered from `profile.yml`.

## Manual regions

The hero, identity statement, routing links, recurring pattern, Boundary
section, human ending, `leave traces.`, and snake picture remain manually
authored.

## Snake

The contribution snake is generated daily and manually through `snake.yml`. SVG
assets live on the `output` branch.
