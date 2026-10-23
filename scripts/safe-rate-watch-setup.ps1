# D03 안전운임 게시판 감시 — 자동화 전용 클론 만들기 + Windows 작업 스케줄러 등록
#
# 사용(PowerShell): powershell -ExecutionPolicy Bypass -File scripts\safe-rate-watch-setup.ps1
#   - 작업하는 저장소와 따로, 옆 폴더에 자동화 전용 클론을 만든다(같은 폴더를 두 곳에서 열지 않는 원칙).
#   - 평일 09:30·16:30에 감시를 돌린다. PC가 꺼져 있었으면 켜진 뒤 한 번 돈다.
#   - 확정 고시는 자동 반영(커밋·push), 예고안은 bot/{버전} 브랜치에 준비만 하고 알린다.
#   - 끄기: Unregister-ScheduledTask -TaskName "myforwarder-safe-rate-watch" -Confirm:$false
#
# 먼저 할 일: 지금 저장소의 커밋이 GitHub에 올라가 있어야 한다(클론이 GitHub에서 받기 때문).

param(
  [string]$BotDir = (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'myforwarder-tools-bot'),
  [string]$Remote = 'https://github.com/forwardingxai/myforwarder-tools.git'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BotDir)) {
  git clone $Remote $BotDir
}
Push-Location $BotDir
try {
  git checkout main
  git pull --ff-only
  npm ci
  $env:SAFE_RATE_BOT = '1'
  node scripts/safe-rate-watch.mjs --baseline
} finally { Pop-Location }

$cmd = Join-Path $BotDir 'scripts\safe-rate-watch-run.cmd'
@"
@echo off
cd /d "$BotDir"
set SAFE_RATE_BOT=1
if not exist raw\safe-rate\watch mkdir raw\safe-rate\watch
echo ===== %date% %time% >> raw\safe-rate\watch\log.txt
node scripts\safe-rate-watch.mjs >> raw\safe-rate\watch\log.txt 2>&1
"@ | Set-Content -Path $cmd -Encoding ascii

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`""
$days = 'Monday','Tuesday','Wednesday','Thursday','Friday'
$triggers = @(
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At '09:30'),
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At '16:30')
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
Register-ScheduledTask -TaskName 'myforwarder-safe-rate-watch' -Description 'D03 안전운임 고시 게시판 감시(myforwarder-tools)' `
  -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "등록했어요: myforwarder-safe-rate-watch (평일 09:30·16:30) · 클론: $BotDir · 기록: $BotDir\raw\safe-rate\watch\log.txt"
