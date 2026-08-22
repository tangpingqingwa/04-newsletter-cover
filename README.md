# Newsletter Cover

Public auction for the next issue’s cover / first slot. Readers watch the bidding. The highest whole-dollar USD bid is issue **#1**.

Build contract: [SPEC.md](./SPEC.md).  
How we work: [CONTRIBUTING.md](./CONTRIBUTING.md). `main` stays buildable and testable.  
How we build: [BUILD.md](./BUILD.md) — stack, ranking, Polar fixture, PR sequence through live-smoke.

Clone of [outbid.lol](https://outbid.lol) for a global English vertical newsletter: min $5, rank is the bid, older listing wins ties, raise pays the difference, tracking stripped, no chat or NSFW, Polar + fixture, public clicks on the sponsor URL. Editor veto is documented and **off** in v1.

```bash
bash scripts/test.sh
```
