<#
.SYNOPSIS
    Captures raw PCOB API responses during a match, and reports what they settle.

.DESCRIPTION
    The whole PCOB integration is currently written against vendor PDFs that disagree with each
    other (specs/PCOB-API.md §2). One capture from a real match closes every open question at once.
    This script is what turns a rehearsal slot into that capture.

    It does two things, in order of importance:

      1. Saves every raw response to disk, byte for byte. This is the artifact. Even if the
         analysis below is wrong, the files are the evidence and can be re-read forever.
      2. Prints a short report answering the five specific questions in specs/PCOB-API.md §8, so
         the operator knows before leaving the venue whether the capture is any good.

    Field names are detected from the RAW TEXT with case-sensitive regexes, never through
    PowerShell property access. PowerShell matches property names case-insensitively, so
    $response.playerinfolist would happily resolve a key actually spelled "PlayerInfoList" — and
    the exact casing is one of the things we are here to find out.

.PARAMETER BaseUrl
    Where the PCOB API answers. Default is the OB PC itself. If you are running this script from a
    different machine, pass that PC's address, e.g. -BaseUrl http://192.168.1.50:10086

.PARAMETER Seconds
    How long to keep sampling. Default 300 (5 minutes). Cover an elimination if you can — that is
    what answers the 'rank' question.

.PARAMETER IntervalSeconds
    Seconds between samples. Default 2, matching the upstream refresh rate. Faster gains nothing.

.PARAMETER OutDir
    Where to write. Default is a timestamped folder on the Desktop.

.EXAMPLE
    .\capture-pcob.ps1
    .\capture-pcob.ps1 -Seconds 600 -BaseUrl http://192.168.1.50:10086
#>

[CmdletBinding()]
param(
    [string] $BaseUrl = 'http://127.0.0.1:10086',
    [int]    $Seconds = 300,
    [int]    $IntervalSeconds = 2,
    [string] $OutDir
)

$ErrorActionPreference = 'Stop'

# Probed once at the start. Everything the vendor documents mention, including the routes we have
# no use for -- an endpoint that answers unexpectedly is itself a finding, and probing costs one
# request.
$AllRoutes = @(
    'gettotalplayerlist', 'getteaminfolist', 'isingame', 'getkillinfo',
    'getgameglobalinfo', 'setcircleinfo', 'getobservingplayer',
    'getplayerweapondetailinfo', 'gettdmresultinfo', 'getairdropboxinfo',
    'getteambackpackinfo', 'getplayersaminfo', 'getplayerssightusageinfo'
)

# Sampled repeatedly. Only the routes that change during play.
$LiveRoutes = @('gettotalplayerlist', 'getteaminfolist', 'isingame', 'getkillinfo')

if (-not $OutDir) {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $OutDir = Join-Path ([Environment]::GetFolderPath('Desktop')) "pcob-capture_$stamp"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$transcript = Join-Path $OutDir '_log.txt'

function Write-Log {
    param([string] $Message, [string] $Color = 'Gray')
    Write-Host $Message -ForegroundColor $Color
    Add-Content -Path $transcript -Value $Message -Encoding utf8
}

<#
    Writes a file as UTF-8 WITHOUT a byte-order mark.

    Windows PowerShell 5.1's `Set-Content -Encoding utf8` always emits a BOM, and a BOM makes the
    saved JSON fail to parse in most tooling -- including JSON.parse. These files exist to be read
    later by somebody else's parser, so the BOM has to go.
#>
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Save-Text {
    param([string] $Path, [string] $Content)
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

<#
    One request. Returns a hashtable rather than throwing, because a route that fails is data too:
    "getgameglobalinfo returned 404" is worth recording, not worth stopping for.
#>
function Invoke-Route {
    param([string] $Route)

    $url = "$BaseUrl/$Route"
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        return @{ Ok = $true; Status = $response.StatusCode; Body = $response.Content }
    }
    catch {
        $status = ''
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; Status = $status; Body = ''; Error = $_.Exception.Message }
    }
}

# --- Preflight ---------------------------------------------------------------------------------

Write-Log ''
Write-Log '=== PCOB capture ===' Cyan
Write-Log "  target : $BaseUrl"
Write-Log "  output : $OutDir"
Write-Log "  window : $Seconds s, sampling every $IntervalSeconds s"
Write-Log ''

$preflight = Invoke-Route 'isingame'
if (-not $preflight.Ok) {
    Write-Log 'CANNOT REACH THE API.' Red
    Write-Log ''
    Write-Log 'Check, in this order:' Yellow
    Write-Log '  1. Is the launch.bat console window still open on the OB PC?'
    Write-Log '     (WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat)'
    Write-Log '  2. Is "API Enable" ticked in the PCOB client?'
    Write-Log '  3. Is the PCOB client actually running and logged in?'
    Write-Log "  4. If this script runs on a different PC: is $BaseUrl the OB PC's address,"
    Write-Log '     and does its firewall allow port 10086?'
    Write-Log ''
    Write-Log "  ($($preflight.Error))" DarkGray
    exit 1
}
Write-Log 'API is reachable.' Green
Write-Log ''

# --- Probe every documented route once ---------------------------------------------------------

Write-Log '--- Probing every documented route ---' Cyan
$probeDir = Join-Path $OutDir 'probe'
New-Item -ItemType Directory -Force -Path $probeDir | Out-Null

$reachable = @()
foreach ($route in $AllRoutes) {
    $result = Invoke-Route $route
    if ($result.Ok) {
        Save-Text (Join-Path $probeDir "$route.json") $result.Body
        $size = $result.Body.Length
        Write-Log ("  {0,-28} OK    {1} chars" -f $route, $size) Green
        $reachable += $route
    }
    else {
        $label = $result.Status
        if (-not $label) { $label = 'no response' }
        Write-Log ("  {0,-28} FAIL  {1}" -f $route, $label) DarkGray
    }
}
Write-Log ''

# --- Sample the live routes --------------------------------------------------------------------

Write-Log '--- Sampling ---' Cyan
Write-Log 'Leave this running. Press Ctrl+C to stop early.' Yellow
Write-Log ''

$samplesDir = Join-Path $OutDir 'samples'
New-Item -ItemType Directory -Force -Path $samplesDir | Out-Null

$deadline = (Get-Date).AddSeconds($Seconds)
$sample = 0
$playerListBodies = New-Object System.Collections.ArrayList
$teamListBodies = New-Object System.Collections.ArrayList

while ((Get-Date) -lt $deadline) {
    $sample++
    $index = '{0:d4}' -f $sample
    $line = "  sample $index"

    foreach ($route in $LiveRoutes) {
        $result = Invoke-Route $route
        if ($result.Ok) {
            $path = Join-Path $samplesDir "$index`_$route.json"
            Save-Text $path $result.Body
            if ($route -eq 'gettotalplayerlist') { [void]$playerListBodies.Add($result.Body) }
            if ($route -eq 'getteaminfolist') { [void]$teamListBodies.Add($result.Body) }
        }
    }

    # One line per sample would scroll a 5-minute capture off the screen; a dot per sample keeps
    # the operator able to see it is alive without burying the earlier output.
    if ($sample % 15 -eq 0) {
        $remaining = [int]($deadline - (Get-Date)).TotalSeconds
        Write-Log "$line  ($remaining s left)"
    }
    else {
        Write-Host '.' -NoNewline
    }

    Start-Sleep -Seconds $IntervalSeconds
}

Write-Host ''
Write-Log ''
Write-Log "Captured $sample samples." Green
Write-Log ''

# --- Analysis ----------------------------------------------------------------------------------
#
# Everything below answers a specific numbered gap in specs/PCOB-API.md §8. If the analysis is
# wrong, the raw files above are still the answer -- this section only exists so the operator finds
# out at the venue, not a week later.

function Find-KeyCasing {
    <#
        Which of several candidate spellings actually appears in the raw JSON.
        Case-SENSITIVE by design -- the casing is the question.
    #>
    param([string] $Body, [string[]] $Candidates)

    $found = @()
    foreach ($candidate in $Candidates) {
        if ($Body -cmatch ('"' + [regex]::Escape($candidate) + '"\s*:')) { $found += $candidate }
    }
    # Returned unwrapped on purpose. Every call site wraps the result in @( ), which restores array
    # semantics; returning ,$found as well would nest one array inside another and every report
    # line would print "System.Object[]" instead of the field name.
    return $found
}

Write-Log '=== What this capture settles ===' Cyan
Write-Log ''

$firstPlayers = ''
if ($playerListBodies.Count -gt 0) { $firstPlayers = $playerListBodies[0] }

if (-not $firstPlayers) {
    Write-Log 'No gettotalplayerlist response was captured -- nothing to analyse.' Red
    Write-Log 'The raw files are still in the output folder. Send them anyway.' Yellow
}
else {
    # Gap 1 -- the envelope key, and the disputed field spellings.
    $envelope = @(Find-KeyCasing $firstPlayers @('TotalPlayerList', 'playerInfoList', 'totalPlayerList', 'PlayerInfoList'))
    if ($envelope.Count -gt 0) {
        Write-Log "  [1] Envelope key .......... $($envelope -join ', ')" Green
    }
    else {
        Write-Log '  [1] Envelope key .......... NEITHER expected name found -- read the raw file' Yellow
    }

    $disputed = @(
        @{ Name = 'survival time'; Candidates = @('survivalTime', 'surviceTime') },
        @{ Name = 'blue circle'; Candidates = @('isOutsideBlueCircle', 'isOutSideBlueCircle') },
        @{ Name = 'player id'; Candidates = @('uId', 'uID') },
        @{ Name = 'position'; Candidates = @('location', 'posX') }
    )
    foreach ($item in $disputed) {
        $hit = @(Find-KeyCasing $firstPlayers $item.Candidates)
        $shown = '(absent)'
        if ($hit.Count -gt 0) { $shown = $hit -join ', ' }
        Write-Log ("      {0,-22} {1}" -f $item.Name, $shown)
    }

    # Fields the 3.0.0 dictionary claims but the 1.5.0 sample lacks. killNumBeforeDie is the one
    # that matters: without it a dead player's eliminations reset to zero on the leaderboard.
    foreach ($field in @('killNumBeforeDie', 'teamName', 'bHasDied', 'playerKey', 'teamId')) {
        $hit = @(Find-KeyCasing $firstPlayers @($field))
        $mark = 'ABSENT'
        $colour = 'Yellow'
        if ($hit.Count -gt 0) { $mark = 'present'; $colour = 'Green' }
        Write-Log ("      {0,-22} {1}" -f $field, $mark) $colour
    }
    Write-Log ''

    # Gap 2 -- does getteaminfolist carry GameID and the timing block?
    if ($teamListBodies.Count -gt 0) {
        $gameId = @(Find-KeyCasing $teamListBodies[0] @('GameID', 'gameId', 'GameId'))
        if ($gameId.Count -gt 0) {
            Write-Log "  [2] GameID in getteaminfolist  $($gameId -join ', ')" Green
        }
        else {
            Write-Log '  [2] GameID in getteaminfolist  ABSENT -- match detection needs isingame instead' Yellow
        }
    }
    Write-Log ''

    # Gap 3 -- does 'rank' populate during the match, or stay 0 until it ends?
    $ranks = @()
    foreach ($body in $playerListBodies) {
        foreach ($m in [regex]::Matches($body, '"rank"\s*:\s*(\d+)')) { $ranks += [int]$m.Groups[1].Value }
    }
    $nonZeroRanks = @($ranks | Where-Object { $_ -gt 0 })
    if ($nonZeroRanks.Count -gt 0) {
        $distinct = ($nonZeroRanks | Sort-Object -Unique) -join ', '
        Write-Log "  [3] rank populates LIVE ... yes -- saw $distinct" Green
    }
    elseif ($ranks.Count -gt 0) {
        Write-Log '  [3] rank populates LIVE ... every rank was 0' Yellow
        Write-Log '      Inconclusive unless a team was actually eliminated during the capture.' DarkGray
    }
    Write-Log ''

    # Gap 5 -- is playerKey stable between samples? Slot assignment depends entirely on this.
    if ($playerListBodies.Count -ge 2) {
        $firstKeys = @([regex]::Matches($playerListBodies[0], '"playerKey"\s*:\s*(\d+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object)
        $lastKeys = @([regex]::Matches($playerListBodies[$playerListBodies.Count - 1], '"playerKey"\s*:\s*(\d+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object)

        if ($firstKeys.Count -eq 0) {
            Write-Log '  [5] playerKey stable ...... no playerKey found at all' Yellow
        }
        elseif (($firstKeys -join ',') -eq ($lastKeys -join ',')) {
            Write-Log "  [5] playerKey stable ...... yes -- same $($firstKeys.Count) keys first and last" Green
        }
        else {
            $kept = @($firstKeys | Where-Object { $lastKeys -contains $_ }).Count
            Write-Log "  [5] playerKey stable ...... CHANGED -- $kept of $($firstKeys.Count) kept" Red
            Write-Log '      Slot assignment cannot use playerKey. Tell the developer.' Yellow
        }
    }
    Write-Log ''
}

Write-Log '=== Done ===' Cyan
Write-Log ''
Write-Log 'Zip the whole output folder and send it over:' Yellow
Write-Log "  $OutDir"
Write-Log ''
Write-Log 'It contains no personal data beyond in-game player names and ids.' DarkGray
Write-Log ''
