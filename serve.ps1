# Serves this folder on your Wi‑Fi so a phone can open it in Safari or Chrome.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8787
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)

try {
  $listener.Start()
} catch {
  Write-Host "Could not start the server on port $port. Close the other program using it, then run this script again."
  Write-Host $_
  exit 1
}

$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } |
  Select-Object -ExpandProperty IPAddress -First 1
if (-not $lan) { $lan = "127.0.0.1" }

Write-Host "On this computer:  http://127.0.0.1:$port/"
Write-Host "On your phone (same Wi-Fi):  http://${lan}:$port/"
Write-Host "Then use Add to Home Screen. Press Ctrl+C to stop."

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

function Send-HttpResponse($stream, [int]$status, [string]$reason, [string]$contentType, [byte[]]$bytes) {
  $header = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
  $headBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headBytes, 0, $headBytes.Length)
  if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000
    $buffer = New-Object byte[] 8192
    $read = $stream.Read($buffer, 0, $buffer.Length)
    $req = [Text.Encoding]::ASCII.GetString($buffer, 0, [Math]::Max(0, $read))
    $first = ($req -split "`r`n")[0]
    $path = "/"
    if ($first -match "^GET\s+(\S+)") {
      $rawPath = $Matches[1]
      $path = [Uri]::UnescapeDataString(($rawPath -split "\?")[0])
    }
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar))
    $full = [IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith([IO.Path]::GetFullPath($root))) {
      Send-HttpResponse $stream 403 "Forbidden" "text/plain" ([Text.Encoding]::UTF8.GetBytes("Forbidden"))
    } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $ctype = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
      Send-HttpResponse $stream 200 "OK" $ctype ([IO.File]::ReadAllBytes($full))
    } else {
      Send-HttpResponse $stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
    }
  } catch {
    # ignore dropped connections
  } finally {
    $client.Close()
  }
}
