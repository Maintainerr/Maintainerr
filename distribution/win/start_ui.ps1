Write-Output "Starting Maintainerr UI..."

$env:NODE_ENV = "production"

node --env-file=./ui/.env.production --env-file=./ui/.env ./ui/server.js 