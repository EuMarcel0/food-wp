# Remove a tarefa agendada do agente Food WP Print.
$ErrorActionPreference = "Stop"
$TaskName = "FoodWpPrintAgent"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tarefa '$TaskName' removida (se existia)."
