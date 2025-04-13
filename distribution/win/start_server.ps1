Write-Output "Starting Maintainerr server..."

$env:NODE_ENV = "production"

npm run --prefix ./server start