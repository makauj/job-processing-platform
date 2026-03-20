param(
    [int]$ApiPort = 8000,
    [string]$RedisContainerName = "job-platform-redis"
)

$ErrorActionPreference = "Continue"
Start-Sleep -Seconds 1

function Stop-ProcessesByCommandLine {
    param(
        [string]$Pattern,
        [string]$Label
    )

    $procs = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and $_.CommandLine -like $Pattern
    }

    foreach ($proc in $procs) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
            Write-Host "Stopped $Label process $($proc.ProcessId)"
        } catch {
            Write-Host "Could not stop $Label process $($proc.ProcessId): $($_.Exception.Message)"
        }
    }
}

try {
    $listeners = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($targetProcess in $listeners) {
        try {
            Stop-Process -Id $targetProcess -Force -ErrorAction Stop
            Write-Host ("Stopped API process on port {0} (process id {1})" -f $ApiPort, $targetProcess)
        } catch {
            Write-Host ("Could not stop API process id {0}; {1}" -f $targetProcess, $_.Exception.Message)
        }
    }
} catch {
    Write-Host "No API process found on port $ApiPort"
}

Stop-ProcessesByCommandLine -Pattern "*app.worker.celery_app*worker*" -Label "Celery worker"
Stop-ProcessesByCommandLine -Pattern "*app.worker.celery_app*flower*" -Label "Flower"

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $running = docker ps --filter "name=^${RedisContainerName}$" --format "{{.Names}}"
    if ($running) {
        docker stop $RedisContainerName *> $null
        Write-Host "Stopped Redis container $RedisContainerName"
    }
}

Write-Host "Stop sequence completed."
