using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Threading;
using System.Windows.Forms;

namespace PoliceLauncher
{
    public class LauncherForm : Form
    {
        private Label titleLabel;
        private Label statusLabel;
        private Button btnStart;
        private Button btnStop;
        private string scriptDir;

        public LauncherForm()
        {
            scriptDir = AppDomain.CurrentDomain.BaseDirectory;

            // Form properties
            this.Text = "Police Project - Control Center";
            this.Size = new Size(440, 270);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(248, 250, 252);

            // Title Label
            titleLabel = new Label();
            titleLabel.Text = "Police Project Control Center";
            titleLabel.Font = new Font("Segoe UI", 13, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(15, 23, 42);
            titleLabel.Size = new Size(380, 30);
            titleLabel.Location = new Point(25, 18);
            titleLabel.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(titleLabel);

            // Status Label
            statusLabel = new Label();
            statusLabel.Text = "🔴 สถานะระบบ: ปิดทำงานอยู่";
            statusLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            statusLabel.ForeColor = Color.FromArgb(100, 116, 139);
            statusLabel.Size = new Size(380, 25);
            statusLabel.Location = new Point(25, 48);
            statusLabel.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(statusLabel);

            // Start Button
            btnStart = new Button();
            btnStart.Text = "🚀 เริ่มใช้งานโปรแกรม (Start App)";
            btnStart.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            btnStart.ForeColor = Color.White;
            btnStart.BackColor = Color.FromArgb(16, 185, 129);
            btnStart.FlatStyle = FlatStyle.Flat;
            btnStart.FlatAppearance.BorderSize = 0;
            btnStart.Size = new Size(350, 45);
            btnStart.Location = new Point(40, 90);
            btnStart.Cursor = Cursors.Hand;
            btnStart.Click += BtnStart_Click;
            this.Controls.Add(btnStart);

            // Stop Button
            btnStop = new Button();
            btnStop.Text = "🛑 ปิดระบบทั้งหมด (Stop App)";
            btnStop.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnStop.ForeColor = Color.White;
            btnStop.BackColor = Color.FromArgb(203, 213, 225);
            btnStop.FlatStyle = FlatStyle.Flat;
            btnStop.FlatAppearance.BorderSize = 0;
            btnStop.Size = new Size(350, 38);
            btnStop.Location = new Point(40, 145);
            btnStop.Cursor = Cursors.Hand;
            btnStop.Enabled = false;
            btnStop.Click += BtnStop_Click;
            this.Controls.Add(btnStop);

            this.FormClosing += LauncherForm_FormClosing;

            UpdateStatus();
        }

        private bool IsPortInUse(int port)
        {
            try
            {
                IPGlobalProperties ipGlobalProperties = IPGlobalProperties.GetIPGlobalProperties();
                IPEndPoint[] tcpConnInfoArray = ipGlobalProperties.GetActiveTcpListeners();
                foreach (IPEndPoint endpoint in tcpConnInfoArray)
                {
                    if (endpoint.Port == port) return true;
                }
            }
            catch { }
            return false;
        }

        private void StopPoliceApp()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "powershell.exe";
                psi.Arguments = "-Command \"Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }\"";
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process p = Process.Start(psi);
                p.WaitForExit();
            }
            catch { }
        }

        private void UpdateStatus()
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new MethodInvoker(UpdateStatus));
                return;
            }

            bool isRunning = IsPortInUse(3000) || IsPortInUse(5003);
            btnStart.Enabled = true;
            if (isRunning)
            {
                statusLabel.Text = "🟢 สถานะระบบ: กำลังทำงานบน http://localhost:3000";
                statusLabel.ForeColor = Color.FromArgb(16, 185, 129);
                btnStart.Text = "🌐 เปิดเบราว์เซอร์อีกครั้ง (localhost:3000)";
                btnStart.BackColor = Color.FromArgb(37, 99, 235);
                btnStop.Enabled = true;
                btnStop.BackColor = Color.FromArgb(239, 68, 68);
            }
            else
            {
                statusLabel.Text = "🔴 สถานะระบบ: ปิดทำงานอยู่";
                statusLabel.ForeColor = Color.FromArgb(100, 116, 139);
                btnStart.Text = "🚀 เริ่มใช้งานโปรแกรม (Start App)";
                btnStart.BackColor = Color.FromArgb(16, 185, 129);
                btnStop.Enabled = false;
                btnStop.BackColor = Color.FromArgb(203, 213, 225);
            }
        }

        private void BtnStart_Click(object sender, EventArgs e)
        {
            if (IsPortInUse(3000) || IsPortInUse(5003))
            {
                try { Process.Start("http://localhost:3000"); } catch {}
                return;
            }

            btnStart.Enabled = false;
            btnStart.BackColor = Color.FromArgb(203, 213, 225);
            statusLabel.Text = "⏳ กำลังเริ่มระบบ (รอประมาณ 5 วินาที)...";
            statusLabel.ForeColor = Color.FromArgb(217, 119, 6);

            ThreadPool.QueueUserWorkItem((state) =>
            {
                string backendDir = Path.Combine(scriptDir, "backend");
                string frontendDir = Path.Combine(scriptDir, "frontend");

                // Check node_modules
                if (!Directory.Exists(Path.Combine(backendDir, "node_modules")))
                {
                    RunCmdHidden("cmd.exe", "/c npm install", backendDir, true);
                }
                if (!Directory.Exists(Path.Combine(frontendDir, "node_modules")))
                {
                    RunCmdHidden("cmd.exe", "/c npm install", frontendDir, true);
                }

                // Start Backend & Frontend
                RunCmdHidden("cmd.exe", "/c npm run dev", backendDir, false);
                RunCmdHidden("cmd.exe", "/c npm run dev", frontendDir, false);

                // Check for ports readiness (up to 8 seconds)
                for (int i = 0; i < 8; i++)
                {
                    Thread.Sleep(1000);
                    if (IsPortInUse(3000) && IsPortInUse(5003)) break;
                }

                try { Process.Start("http://localhost:3000"); } catch {}

                UpdateStatus();
            });
        }

        private void BtnStop_Click(object sender, EventArgs e)
        {
            btnStop.Enabled = false;
            ThreadPool.QueueUserWorkItem((state) =>
            {
                StopPoliceApp();
                UpdateStatus();
            });
        }

        private void LauncherForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            StopPoliceApp();
        }

        private void RunCmdHidden(string fileName, string args, string workingDir, bool waitForExit)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = fileName;
                psi.Arguments = args;
                psi.WorkingDirectory = workingDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process p = Process.Start(psi);
                if (waitForExit && p != null)
                {
                    p.WaitForExit();
                }
            }
            catch { }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }
}
