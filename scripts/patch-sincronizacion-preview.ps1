$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$codigo = Join-Path $repo 'apps-script-preview\Código.js'
$srcSync = Join-Path $repo 'apps-script\sincronizacion-partituras.gs'
$srcDispatcher = Join-Path $repo 'apps-script\sincronizacion-dispatcher-integracion.gs'
$dstSync = Join-Path $repo 'apps-script-preview\sincronizacion-partituras.js'
$dstDispatcher = Join-Path $repo 'apps-script-preview\sincronizacion-dispatcher-integracion.js'

foreach ($path in @($codigo, $srcSync, $srcDispatcher)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Non existe o ficheiro necesario: $path"
  }
}

Copy-Item -LiteralPath $srcSync -Destination $dstSync -Force
Copy-Item -LiteralPath $srcDispatcher -Destination $dstDispatcher -Force

$texto = Get-Content -LiteralPath $codigo -Raw -Encoding UTF8
$accionLista = "listarSincronizacionPartiturasPortal"

if ($texto.Contains($accionLista)) {
  Write-Host 'Código.js xa contén as accións de sincronización; non se duplican.'
} else {
  $erroPos = $texto.IndexOf('Acción non permitida')
  if ($erroPos -lt 0) { $erroPos = $texto.IndexOf('Accion non permitida') }
  if ($erroPos -lt 0) {
    throw 'Non se atopou o bloque final "Acción non permitida" en Código.js. Non se modifica o ficheiro.'
  }

  $marcador = '} else {'
  $insertPos = $texto.LastIndexOf($marcador, $erroPos)
  if ($insertPos -lt 0) {
    throw 'Non se atopou o else final do dispatcher antes de "Acción non permitida". Non se modifica o ficheiro.'
  }

  $bloque = @"
} else if (accion === 'listarSincronizacionPartiturasPortal') {
      resultado = listarSincronizacionPartiturasPortal_(datos);
    } else if (accion === 'gardarSincronizacionPartiturasPortal') {
      resultado = gardarSincronizacionPartiturasPortal_(datos);
    } else if (accion === 'eliminarSincronizacionPartiturasPortal') {
      resultado = eliminarSincronizacionPartiturasPortal_(datos);
    
"@

  $novo = $texto.Substring(0, $insertPos) + $bloque + $texto.Substring($insertPos)
  Set-Content -LiteralPath $codigo -Value $novo -Encoding UTF8
  Write-Host 'Código.js modificado: engadidas as tres accións de sincronización.'
}

$final = Get-Content -LiteralPath $codigo -Raw -Encoding UTF8
$esperadas = @(
  'listarSincronizacionPartiturasPortal',
  'gardarSincronizacionPartiturasPortal',
  'eliminarSincronizacionPartiturasPortal'
)
foreach ($accion in $esperadas) {
  $conteo = ([regex]::Matches($final, [regex]::Escape("accion === '$accion'"))).Count
  if ($conteo -ne 1) {
    throw "Validación fallida: a acción $accion aparece $conteo veces en Código.js."
  }
}

Write-Host 'Validación correcta: as tres accións aparecen exactamente unha vez.'
Write-Host 'Ficheiros preparados para clasp:'
Write-Host " - $dstSync"
Write-Host " - $dstDispatcher"
Write-Host " - $codigo"
