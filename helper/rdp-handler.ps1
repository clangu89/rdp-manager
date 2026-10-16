param([string]$uri)

try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

    if (-not $uri) {
        exit
    }

    # Remove rdpconnect:// prefix and trailing slash
    $raw = $uri -replace '^rdpconnect://', '' -replace '/$', ''
    $raw = [System.Uri]::UnescapeDataString($raw)

    # Decode Base64 JSON
    $jsonBytes = [System.Convert]::FromBase64String($raw)
    $jsonText = [System.Text.Encoding]::UTF8.GetString($jsonBytes)
    $data = $jsonText | ConvertFrom-Json

    $ip = $data.ip
    $port = if ($data.port) { $data.port } else { 3389 }
    $user = $data.user
    $pass = $data.pass

    if ($ip -and $user) {
        # Store credential in Windows Credential Manager for Terminal Server
        $target = "TERMSRV/$ip"
        cmdkey /generic:$target /user:$user /pass:$pass | Out-Null

        # Launch Windows Remote Desktop Connection
        Start-Process "mstsc.exe" -ArgumentList "/v:$ip`:$port"
    }
} catch {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show("Failed to connect Remote Desktop: " + $_.Exception.Message, "RDP Manager Error", 0, 16)
}
