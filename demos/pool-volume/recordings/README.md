# Recorded runs

There are no measured recordings yet. The interface says so; its optional layout example is explicitly illustrative and has no timing or spending claims.

Complete a fresh run with your browser wallet, download its JSON, then import it from this demo directory:

```bash
npm run recording:import -- /absolute/path/to/pool-volume-run.json ethereum-three-hours
```

Review the results, receipt confirmations, selected scope, and timings before committing the recording. The importer strips unknown fields and payment signatures; it refuses to overwrite an existing recording. Recordings contain public wallet addresses and payment transaction identifiers where supplied. They are operator-provided evidence, not independently audited benchmarks.
