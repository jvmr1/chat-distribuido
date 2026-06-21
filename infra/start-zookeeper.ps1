$ErrorActionPreference = "Stop"

$zookeeperDir = $null
$serverScript = $null
$javaCommand = Get-Command java -ErrorAction SilentlyContinue

function Resolve-ZooKeeperHome {
  $candidates = @()

  if ($env:ZOOKEEPER_HOME) {
    $candidates += $env:ZOOKEEPER_HOME
  }

  $candidates += Get-ChildItem -Path $PSScriptRoot -Directory -Filter "apache-zookeeper-*-bin" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName

  foreach ($candidate in $candidates) {
    $script = Join-Path $candidate "bin\zkServer.cmd"
    if (Test-Path $script) {
      return @{
        Home = (Resolve-Path $candidate).Path
        Script = (Resolve-Path $script).Path
      }
    }
  }

  $pathScript = Get-Command zkServer.cmd -ErrorAction SilentlyContinue
  if ($pathScript) {
    $scriptPath = (Resolve-Path $pathScript.Source).Path
    return @{
      Home = (Split-Path (Split-Path $scriptPath -Parent) -Parent)
      Script = $scriptPath
    }
  }

  return $null
}

function Start-ZooKeeperWithDocker {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    return $false
  }

  $composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
  if (-not (Test-Path $composeFile)) {
    return $false
  }

  Write-Host "Distribuicao local do ZooKeeper nao encontrada. Iniciando via Docker Compose..."
  & docker compose -f $composeFile up zookeeper
  return $true
}

$resolvedZooKeeper = Resolve-ZooKeeperHome
if ($resolvedZooKeeper) {
  $zookeeperDir = $resolvedZooKeeper.Home
  $serverScript = $resolvedZooKeeper.Script
}

if (-not $env:JAVA_HOME -and $javaCommand) {
  $javaPath = (Resolve-Path $javaCommand.Source).Path
  $javaBin = Split-Path $javaPath -Parent
  $detectedJavaHome = Split-Path $javaBin -Parent

  if (Test-Path (Join-Path $detectedJavaHome "bin\java.exe")) {
    $env:JAVA_HOME = $detectedJavaHome
  }
}

if (-not $serverScript) {
  if (Start-ZooKeeperWithDocker) {
    exit $LASTEXITCODE
  }

  Write-Error @"
ZooKeeper local nao encontrado.

Opcoes:
1. Defina ZOOKEEPER_HOME apontando para a pasta do Apache ZooKeeper, por exemplo:
   `$env:ZOOKEEPER_HOME="C:\apache-zookeeper-3.9.5-bin"

2. Coloque a distribuicao em:
   $PSScriptRoot\apache-zookeeper-3.9.5-bin

3. Instale Docker e rode novamente este script para usar infra/docker-compose.yml.
"@
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

Write-Host "Usando JAVA_HOME=$env:JAVA_HOME"
Write-Host "Usando ZOOKEEPER_HOME=$zookeeperDir"
Write-Host "Iniciando ZooKeeper em localhost:2181..."

Set-Location $zookeeperDir
& $serverScript
