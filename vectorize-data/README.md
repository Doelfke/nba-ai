# vectorize-data

Utilities to transform raw NBA JSON datasets (historical & upcoming) into simple numeric feature vectors suitable for machine learning experiments.

## Current Status

Now includes Pinecone upsert logic for dense and sparse indexes.

## Usage

Copy `.env.example` to `.env`, set your key, then run:

```bash
cp .env.example .env
echo "PINECONE_API_KEY=YOUR_KEY" >> .env  # or edit manually
npm install
npm start
```

Creates/uses two indexes: `nba-data-dense`, `nba-data-sparse`.

Dense vectors are numeric features extracted per record. Sparse vectors are hashed token frequencies from string fields.

## Planned Features

- Rich per-team or per-player feature engineering
- Normalization and scaling helpers
- Export vectors to CSV / Parquet
- CLI arguments for selecting seasons and output path
- Optional hybrid single-index support

## Contributing

Add feature extractors in `src/featureExtractors/` (to be created) and register them in the main script.
