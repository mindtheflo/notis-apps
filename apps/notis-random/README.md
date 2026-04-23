# Random Number Generator

A simple, well-designed generator that lets you roll integers, decimals, or dice and keeps a history of every result in a Notis database.

## Manifest

- **Slug**: `notis-random`
- **Database**: `rolls` — each roll persists as one row with `Value`, `Mode`, `Min`, `Max`, and `Rolled At`.
- **Routes**: `/` (Generator) and `/history` (History, renders the `rolls` database as a flat collection).

## Properties

_None yet._ Once `app.properties` lands in the SDK, this app will declare `default_min`, `default_max`, and `default_mode` at install time.
