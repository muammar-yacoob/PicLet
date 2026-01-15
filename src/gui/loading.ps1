Add-Type -AssemblyName PresentationFramework

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconPath = Join-Path (Split-Path -Parent $scriptDir) "icons\banana.ico"

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Width="280" Height="367" WindowStartupLocation="CenterScreen"
        ShowInTaskbar="False" Topmost="True" ResizeMode="NoResize">
  <Border Background="#09090b" CornerRadius="12">
    <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
      <Image Name="logo" Width="72" Height="72" Margin="0,0,0,8"/>
      <TextBlock Text="PicLet" FontSize="28" FontWeight="Bold" Foreground="#eab308" HorizontalAlignment="Center"/>
      <TextBlock Text="PEELING PIXELS WITH STYLE" FontSize="11" Foreground="#22c55e" HorizontalAlignment="Center" Margin="0,2,0,16"/>
      <TextBlock Text="Loading your tools..." FontSize="12" Foreground="#636366" HorizontalAlignment="Center" Margin="0,0,0,6"/>
      <StackPanel Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,0,0,20">
        <Ellipse Name="d1" Width="6" Height="6" Fill="#eab308" Margin="3,0"/>
        <Ellipse Name="d2" Width="6" Height="6" Fill="#eab308" Margin="3,0" Opacity="0.3"/>
        <Ellipse Name="d3" Width="6" Height="6" Fill="#eab308" Margin="3,0" Opacity="0.3"/>
      </StackPanel>
      <Rectangle Width="220" Height="1" Fill="#333" Margin="0,0,0,16"/>
      <TextBlock Text="A free tool by" FontSize="10" Foreground="#636366" HorizontalAlignment="Center" Margin="0,0,0,6"/>
      <TextBlock Text="spark-games.co.uk" FontSize="13" Foreground="#eab308" FontWeight="SemiBold" HorizontalAlignment="Center"/>
      <TextBlock Text="Game Dev Tools and Resources" FontSize="9" Foreground="#4a4a4f" HorizontalAlignment="Center" Margin="0,4,0,0"/>
    </StackPanel>
  </Border>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

# Load banana icon
$logo = $window.FindName("logo")
if (Test-Path $iconPath) {
    $bitmap = New-Object System.Windows.Media.Imaging.BitmapImage
    $bitmap.BeginInit()
    $bitmap.UriSource = New-Object System.Uri($iconPath)
    $bitmap.EndInit()
    $logo.Source = $bitmap
}

$d1 = $window.FindName("d1")
$d2 = $window.FindName("d2")
$d3 = $window.FindName("d3")

$script:idx = 0
$script:readyFile = "$env:TEMP\piclet-ready.tmp"

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(200)
$timer.Add_Tick({
    if (Test-Path $script:readyFile) {
        Remove-Item $script:readyFile -Force -ErrorAction SilentlyContinue
        $window.Close()
        return
    }
    $script:idx++
    $d1.Opacity = 0.3; $d2.Opacity = 0.3; $d3.Opacity = 0.3
    switch ($script:idx % 3) {
        0 { $d1.Opacity = 1 }
        1 { $d2.Opacity = 1 }
        2 { $d3.Opacity = 1 }
    }
})
$timer.Start()

$close = New-Object System.Windows.Threading.DispatcherTimer
$close.Interval = [TimeSpan]::FromSeconds(10)
$close.Add_Tick({ $window.Close() })
$close.Start()

$window.ShowDialog() | Out-Null
