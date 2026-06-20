param(
  [string]$HostName = "localhost",
  [string]$OutputDir = "$PSScriptRoot\certs"
)

$ErrorActionPreference = "Stop"

function Export-PrivateKeyPkcs8($RsaKey) {
  if ($RsaKey.GetType().GetMethod("ExportPkcs8PrivateKey")) {
    return $RsaKey.ExportPkcs8PrivateKey()
  }

  if ($RsaKey -is [System.Security.Cryptography.RSACng]) {
    return $RsaKey.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
  }

  throw "Nao foi possivel exportar a chave privada em PKCS#8 neste ambiente. Instale PowerShell 7+ ou OpenSSL, ou gere manualmente cert.pem/key.pem."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  "CN=$HostName",
  $rsa,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)

$sanBuilder = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$sanBuilder.AddDnsName($HostName)
$request.CertificateExtensions.Add($sanBuilder.Build())
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $false)
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
    $false
  )
)

$notBefore = [System.DateTimeOffset]::Now.AddMinutes(-5)
$notAfter = $notBefore.AddYears(1)
$certificate = $request.CreateSelfSigned($notBefore, $notAfter)

$certPem = @(
  "-----BEGIN CERTIFICATE-----"
  [System.Convert]::ToBase64String($certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert), [System.Base64FormattingOptions]::InsertLineBreaks)
  "-----END CERTIFICATE-----"
) -join [Environment]::NewLine

$keyPem = @(
  "-----BEGIN PRIVATE KEY-----"
  [System.Convert]::ToBase64String((Export-PrivateKeyPkcs8 $rsa), [System.Base64FormattingOptions]::InsertLineBreaks)
  "-----END PRIVATE KEY-----"
) -join [Environment]::NewLine

$certPath = Join-Path $OutputDir "localhost-cert.pem"
$keyPath = Join-Path $OutputDir "localhost-key.pem"

Set-Content -Path $certPath -Value $certPem -Encoding ascii
Set-Content -Path $keyPath -Value $keyPem -Encoding ascii

Write-Output "Certificate: $certPath"
Write-Output "Private key:  $keyPath"
