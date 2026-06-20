$ErrorActionPreference = "Stop"

$zookeeperDir = Join-Path $PSScriptRoot "apache-zookeeper-3.9.5-bin"
$serverScript = Join-Path $zookeeperDir "bin\zkServer.cmd"
$javaCommand = Get-Command java -ErrorAction SilentlyContinue

if (-not $env:JAVA_HOME -and $javaCommand) {
  $javaPath = (Resolve-Path $javaCommand.Source).Path
  $javaBin = Split-Path $javaPath -Parent
  $detectedJavaHome = Split-Path $javaBin -Parent

  if (Test-Path (Join-Path $detectedJavaHome "bin\java.exe")) {
    $env:JAVA_HOME = $detectedJavaHome
  }
}

if (-not $env:JAVA_HOME) {
  Write-Error "JAVA_HOME nao esta configurado. Instale um JDK e configure JAVA_HOME apontando para a pasta do JDK, por exemplo C:\Program Files\Eclipse Adoptium\jdk-21.x.x."
}

if ((Split-Path $env:JAVA_HOME -Leaf) -ieq "bin") {
  $env:JAVA_HOME = Split-Path $env:JAVA_HOME -Parent
}

if (-not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
  Write-Error "JAVA_HOME esta configurado, mas bin\java.exe nao foi encontrado em $env:JAVA_HOME."
}

if (-not (Test-Path $serverScript)) {
  Write-Error "zkServer.cmd nao encontrado em $serverScript"
}

Write-Host "Usando JAVA_HOME=$env:JAVA_HOME"
Write-Host "Iniciando ZooKeeper em localhost:2181..."

Set-Location $zookeeperDir
& $serverScript
