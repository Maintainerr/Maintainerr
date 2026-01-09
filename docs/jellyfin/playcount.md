# Jellyfin: playCount vs viewCount

| Property    | What it counts                                |
| ----------- | --------------------------------------------- |
| `viewCount` | Users who **completed** watching              |
| `playCount` | Total **play attempts** (including abandoned) |

## Example

"Very Good Movie" has `PlayCount=2, Played=false` in Jellyfin:

- `playCount = 2`
- `viewCount = 0`

## Useful Rule

**Movies started but never finished:**

```
playCount >= 1 AND viewCount = 0
```
