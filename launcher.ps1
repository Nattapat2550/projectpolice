# Hide PowerShell console window natively
try {
    $async = '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);'
    $type = Add-Type -MemberDefinition $async -Name "Win32ShowWindowAsync" -Namespace Win32Functions -PassThru
    $hwnd = (Get-Process -Id $PID).MainWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
        $type::ShowWindowAsync($hwnd, 0)
    }
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Create Main Form
$form = New-Object System.Windows.Forms.Form
$form.Text = "Police Project - Control Center"
$form.Size = New-Object System.Drawing.Size(420, 270)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)

# Title Label
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Police Project Control Center"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$titleLabel.Size = New-Object System.Drawing.Size(370, 30)
$titleLabel.Location = New-Object System.Drawing.Point(25, 18)
$titleLabel.TextAlign = "MiddleCenter"
$form.Controls.Add($titleLabel)

# Status Label
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "🔴 สถานะระบบ: ปิดทำงานอยู่"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Regular)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$statusLabel.Size = New-Object System.Drawing.Size(370, 25)
$statusLabel.Location = New-Object System.Drawing.Point(25, 48)
$statusLabel.TextAlign = "MiddleCenter"
$form.Controls.Add($statusLabel)

# Start / Open Button
$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = "🚀 เริ่มใช้งานโปรแกรม (Start App)"
$btnStart.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)
$btnStart.ForeColor = [System.Drawing.Color]::White
$btnStart.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$btnStart.FlatStyle = "Flat"
$btnStart.FlatAppearance.BorderSize = 0
$btnStart.Size = New-Object System.Drawing.Size(330, 45)
$btnStart.Location = New-Object System.Drawing.Point(45, 90)
$btnStart.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnStart)

# Stop App Button
$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = "🛑 ปิดระบบทั้งหมด (Stop App)"
$btnStop.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnStop.ForeColor = [System.Drawing.Color]::White
$btnStop.BackColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
$btnStop.FlatStyle = "Flat"
$btnStop.FlatAppearance.BorderSize = 0
$btnStop.Size = New-Object System.Drawing.Size(330, 38)
$btnStop.Location = New-Object System.Drawing.Point(45, 145)
$btnStop.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnStop.Enabled = $false
$form.Controls.Add($btnStop)

# Helper: Kill ports 3000 and 5003
function Stop-PoliceApp {
    Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Function to check and update UI status
function Update-AppStatus {
    $conns = Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue
    if ($conns) {
        $statusLabel.Text = "🟢 สถานะระบบ: กำลังทำงานบน http://localhost:3000"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
        $btnStart.Text = "🌐 เปิดเบราว์เซอร์อีกครั้ง"
        $btnStart.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
        $btnStop.Enabled = $true
        $btnStop.BackColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
    } else {
        $statusLabel.Text = "🔴 สถานะระบบ: ปิดทำงานอยู่"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
        $btnStart.Text = "🚀 เริ่มใช้งานโปรแกรม (Start App)"
        $btnStart.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
        $btnStop.Enabled = $false
        $btnStop.BackColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
    }
}

# Event: Start Button Click
$btnStart.Add_Click({
    $conns = Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue
    if ($conns) {
        Start-Process "http://localhost:3000"
        return
    }

    $statusLabel.Text = "⏳ กำลังเริ่มระบบ (รอประมาณ 5 วินาที)..."
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(217, 119, 6)
    $form.Refresh()

    # Check node_modules
    if (-not (Test-Path "$ScriptDir\backend\node_modules")) {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$ScriptDir\backend`" && npm install" -Wait -WindowStyle Hidden
    }
    if (-not (Test-Path "$ScriptDir\frontend\node_modules")) {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$ScriptDir\frontend`" && npm install" -Wait -WindowStyle Hidden
    }

    # Start Backend & Frontend silently
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$ScriptDir\backend`" && npm run dev" -WindowStyle Hidden
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$ScriptDir\frontend`" && npm run dev" -WindowStyle Hidden

    Start-Sleep -Seconds 5
    Start-Process "http://localhost:3000"
    Update-AppStatus
})

# Event: Stop Button Click
$btnStop.Add_Click({
    Stop-PoliceApp
    Update-AppStatus
})

# Event: Window Close (User clicks X) -> Automatically Stop all processes!
$form.Add_FormClosing({
    Stop-PoliceApp
})

# Initialize status
Update-AppStatus

[void]$form.ShowDialog()
