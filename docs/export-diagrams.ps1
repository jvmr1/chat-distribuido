param(
  [string]$InputFile = "$PSScriptRoot\diagrams.md",
  [string]$OutputDir = "$PSScriptRoot\generated-diagrams",
  [string]$Format = "png"
)

$ErrorActionPreference = "Stop"

function Convert-ToSlug([string]$Value) {
  $normalized = $Value.ToLowerInvariant()
  $normalized = $normalized -replace "[áàãâä]", "a"
  $normalized = $normalized -replace "[éèêë]", "e"
  $normalized = $normalized -replace "[íìîï]", "i"
  $normalized = $normalized -replace "[óòõôö]", "o"
  $normalized = $normalized -replace "[úùûü]", "u"
  $normalized = $normalized -replace "ç", "c"
  $normalized = $normalized -replace "[^a-z0-9]+", "-"
  $normalized = $normalized.Trim("-")
  return $normalized
}

function Assert-MermaidCli {
  $command = Get-Command "mmdc" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Mermaid CLI nao encontrado. Instale com: npm install -g @mermaid-js/mermaid-cli"
}

$mmdc = Assert-MermaidCli
$markdown = Get-Content -Raw -Path $InputFile
$pattern = '(?ms)^##\s+(.+?)\r?\n.*?```mermaid\r?\n(.*?)```'
$matches = [regex]::Matches($markdown, $pattern)

if ($matches.Count -eq 0) {
  throw "Nenhum bloco Mermaid encontrado em $InputFile."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$tempDir = Join-Path $OutputDir ".tmp"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$index = 1
foreach ($match in $matches) {
  $title = $match.Groups[1].Value.Trim()
  $diagram = $match.Groups[2].Value.Trim()
  $slug = Convert-ToSlug $title
  $prefix = "{0:D2}" -f $index
  $inputPath = Join-Path $tempDir "$prefix-$slug.mmd"
  $outputPath = Join-Path $OutputDir "$prefix-$slug.$Format"

  Set-Content -Path $inputPath -Value $diagram -Encoding utf8
  & $mmdc -i $inputPath -o $outputPath

  Write-Output $outputPath
  $index += 1
}

Remove-Item -LiteralPath $tempDir -Recurse -Force
