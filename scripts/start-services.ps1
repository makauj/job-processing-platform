param(
    [string]$RedisContainerName = "job-platform-redis",
    [string]$RedisImage = "redis:7-alpine",
    [int]$ApiPort = 8000,
    [switch]$StartFlower
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$pythonExe = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Python virtual environment not found at $pythonExe"
}

function Initialize-Redis {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker CLI is required to start Redis automatically."
    }

    docker info *> $null

    $exists = docker ps -a --filter "name=^${RedisContainerName}$" --format "{{.Names}}"
    if ($exists) {
        docker start $RedisContainerName *> $null
    } else {
        docker run -d --name $RedisContainerName -p 6379:6379 $RedisImage *> $null
    }
}

function Test-PortInUse([int]$Port) {
    $result = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $result
}

function Start-Api {
    if (Test-PortInUse -Port $ApiPort) {
        Write-Host "API appears to already be running on port $ApiPort."
        return
    }

    Start-Process -FilePath $pythonExe `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$ApiPort" `
        -WorkingDirectory $repoRoot `
        -WindowStyle Minimized

    Write-Host "Started API on http://127.0.0.1:$ApiPort"
}

function Start-Worker {
    $alreadyRunning = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and $_.CommandLine -like "*app.worker.celery_app*worker*"
        }

    if ($alreadyRunning) {
        Write-Host "Celery worker appears to already be running."
        return
    }

    Start-Process -FilePath $pythonExe `
        -ArgumentList "-m", "celery", "-A", "app.worker.celery_app", "worker", "--loglevel=info", "-P", "solo" `
        -WorkingDirectory $repoRoot `
        -WindowStyle Minimized

    Write-Host "Started Celery worker (Windows-safe solo pool)."
}

function Start-Flower {
    $alreadyRunning = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and $_.CommandLine -like "*app.worker.celery_app*flower*"
        }

    if ($alreadyRunning) {
        Write-Host "Flower appears to already be running."
        return
    }

    Start-Process -FilePath $pythonExe `
        -ArgumentList "-m", "celery", "-A", "app.worker.celery_app", "flower", "--conf=flowerconfig.py" `
        -WorkingDirectory $repoRoot `
        -WindowStyle Minimized

    Write-Host "Started Flower at http://127.0.0.1:5555/flower"
}

Initialize-Redis
Start-Api
Start-Worker

if ($StartFlower) {
    Start-Flower
}

Write-Host "All requested services started."
