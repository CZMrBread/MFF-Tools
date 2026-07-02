<?php
// Konfigurace souborů
$nodesFile = 'nodes.json';
$linksFile = 'links.json';

// Pomocné funkce pro čtení a zápis
function getJsonData($filename) {
    if (!file_exists($filename)) return [];
    $data = json_decode(file_get_contents($filename), true);
    return is_array($data) ? $data : [];
}

function saveJsonData($filename, $data) {
    file_put_contents($filename, json_encode(array_values($data), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// Validační funkce
function validateId($id) {
    // Povoluje pouze písmena, čísla, pomlčky a podtržítka, max 64 znaků
    return is_string($id) && preg_match('/^[a-zA-Z0-9_\-]{1,64}$/', $id);
}

function validateColor($color) {
    // Povoluje pouze validní HEX barvy (#fff nebo #ffffff)
    return is_string($color) && preg_match('/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/', $color);
}

function validateLabel($label) {
    // Maximálně 200 znaků, nesmí být prázdný
    return is_string($label) && mb_strlen($label) >= 1 && mb_strlen($label) <= 200;
}

function validateStudyType($type) {
    // Povoluje pouze dvě definované hodnoty
    return in_array($type, ['bakalarske', 'magisterske'], true);
}

// Normalizace klíče pv_group skupiny — čísla necháme jako int, jinak string (např. "telocvik")
function normalizeGroupKey($key) {
    if (is_string($key) && preg_match('/^-?\d+$/', $key)) {
        return (int)$key;
    }
    return $key;
}

function studyTypeToLevel($studyType) {
    return $studyType === 'magisterske' ? 'mgr' : 'bc';
}

// Načtení dat a převod do asociativních polí pro snadnou editaci
$nodesRaw = getJsonData($nodesFile);
$linksRaw = getJsonData($linksFile);

$nodes = [];
foreach ($nodesRaw as $node) {
    $nodes[$node['id']] = $node;
}

// Pomocná funkce: najde program_req uzel pro dané spec ID
function findReqForSpec($nodes, $specId) {
    foreach ($nodes as $n) {
        if (($n['group'] ?? '') === 'program_req' && ($n['spec'] ?? '') === $specId) {
            return $n;
        }
    }
    return null;
}

// Whitelist povolených akcí
$allowed_actions = ['list', 'edit_spec', 'edit_subj', 'save_spec', 'save_subj', 'delete'];
$action = in_array($_GET['action'] ?? '', $allowed_actions) ? $_GET['action'] : 'list';
$msg = '';

// --- ZPRACOVÁNÍ FORMULÁŘŮ (CRUD OPERACE) ---

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'save_spec') {
        $id         = $_POST['id'] ?? '';
        $label      = $_POST['label'] ?? '';
        $color      = $_POST['color'] ?? '';
        $study_type = $_POST['study_type'] ?? 'bakalarske';
        $subjects_post = is_array($_POST['subjects'] ?? null) ? $_POST['subjects'] : [];
        $subjects_pvgroup_post = is_array($_POST['subjects_pvgroup'] ?? null) ? $_POST['subjects_pvgroup'] : [];

        // --- Studijní požadavky (program_req) ---
        $total_credits     = (int)($_POST['total_credits'] ?? 0);
        $mandatory_credits = (int)($_POST['mandatory_credits'] ?? 0);
        $pv_overall_min    = (int)($_POST['pv_overall_min'] ?? 0);

        $pv_group_keys   = $_POST['pvg_key'] ?? [];
        $pv_group_labels = $_POST['pvg_label'] ?? [];
        $pv_group_mins   = $_POST['pvg_min'] ?? [];

        if (!validateId($id)) {
            $msg = "Chyba: Neplatné ID. Povolena jsou pouze písmena, čísla, pomlčky a podtržítka (max 64 znaků).";
        } elseif (!validateLabel($label)) {
            $msg = "Chyba: Název musí být neprázdný řetězec do 200 znaků.";
        } elseif (!validateColor($color)) {
            $msg = "Chyba: Barva musí být ve formátu HEX (#fff nebo #ffffff).";
        } elseif (!validateStudyType($study_type)) {
            $msg = "Chyba: Neplatný typ studia.";
        } else {
            // Uložení samotného uzlu specializace
            $nodes[$id] = [
                'id'         => $id,
                'label'      => $label,
                'group'      => 'spec',
                'study_type' => $study_type,
                'color'      => $color,
                'radius'     => max(1, (int)$_POST['radius'])
            ];

            // --- Sestavení pv_groups ze zadaných řádků formuláře ---
            $pv_groups = [];
            $valid_group_keys = []; // normalizované klíče použitelné v selectu předmětů
            for ($i = 0; $i < count($pv_group_keys); $i++) {
                $rawKey = trim((string)($pv_group_keys[$i] ?? ''));
                $glabel = trim((string)($pv_group_labels[$i] ?? ''));
                $gmin   = (int)($pv_group_mins[$i] ?? 0);

                if ($rawKey === '') continue; // prázdný řádek přeskočíme

                $key = normalizeGroupKey($rawKey);
                $pv_groups[] = [
                    'group'       => $key,
                    'label'       => $glabel !== '' ? $glabel : (string)$key,
                    'min_credits' => max(0, $gmin)
                ];
                $valid_group_keys[] = (string)$key;
            }

            // --- Zpracování přiřazených předmětů z pohledu specializace ---
            $valid_subj_ids = array_keys(array_filter($nodes, fn($n) => $n['group'] === 'subj'));

            foreach ($valid_subj_ids as $subjId) {
                $type = $subjects_post[$subjId] ?? 'none';

                // Nejprve odstraníme ID této specializace z obou polí předmětu (abychom předešli duplikátům)
                $nodes[$subjId]['mandatory_in'] = array_values(array_diff($nodes[$subjId]['mandatory_in'] ?? [], [$id]));
                $nodes[$subjId]['elective_in'] = array_values(array_diff($nodes[$subjId]['elective_in'] ?? [], [$id]));

                // Odstraníme případný starý záznam pv_group pro tuto specializaci
                if (isset($nodes[$subjId]['pv_group'][$id])) {
                    unset($nodes[$subjId]['pv_group'][$id]);
                }

                // Pokud byl předmět přiřazen, vložíme ho do správného pole
                if ($type === 'mandatory') {
                    $nodes[$subjId]['mandatory_in'][] = $id;
                } elseif ($type === 'elective') {
                    $nodes[$subjId]['elective_in'][] = $id;

                    // U povinně volitelných předmětů uložíme i jejich pv_group (pokud byla vybrána)
                    $chosenGroup = $subjects_pvgroup_post[$subjId] ?? '';
                    if ($chosenGroup !== '') {
                        if (!isset($nodes[$subjId]['pv_group']) || !is_array($nodes[$subjId]['pv_group'])) {
                            $nodes[$subjId]['pv_group'] = [];
                        }
                        $nodes[$subjId]['pv_group'][$id] = normalizeGroupKey($chosenGroup);
                    }
                }

                // Pokud už předmět nemá žádnou vazbu pv_group, uklidíme prázdné pole
                if (isset($nodes[$subjId]['pv_group']) && empty($nodes[$subjId]['pv_group'])) {
                    unset($nodes[$subjId]['pv_group']);
                }

                // Přepočítání sdílení a typu kurzu pro daný předmět
                $m_in = $nodes[$subjId]['mandatory_in'];
                $e_in = $nodes[$subjId]['elective_in'];
                $nodes[$subjId]['shared_count'] = count($m_in) + count($e_in);

                if (!empty($m_in) && empty($e_in)) $nodes[$subjId]['course_type'] = 'mandatory';
                elseif (empty($m_in) && !empty($e_in)) $nodes[$subjId]['course_type'] = 'elective';
                elseif (empty($m_in) && empty($e_in)) $nodes[$subjId]['course_type'] = 'none';
                else $nodes[$subjId]['course_type'] = 'mixed';
            }

            // --- Uložení / aktualizace program_req uzlu pro tuto specializaci ---
            $reqId = 'req_' . $id;
            $nodes[$reqId] = [
                'id'                 => $reqId,
                'group'              => 'program_req',
                'spec'               => $id,
                'level'              => studyTypeToLevel($study_type),
                'total_credits'      => max(0, $total_credits),
                'mandatory_credits'  => max(0, $mandatory_credits),
                'pv_overall_min'     => max(0, $pv_overall_min),
                'pv_groups'          => $pv_groups
            ];

            // Obnova links.json pro tuto specializaci (smažeme všechny linky směřující na tento spec_id)
            $linksRaw = array_filter($linksRaw, function($l) use ($id) {
                return $l['target'] !== $id;
            });

            // Vytvoříme nové linky podle odeslaného formuláře
            foreach ($subjects_post as $subjId => $type) {
                if (in_array($subjId, $valid_subj_ids) && in_array($type, ['mandatory', 'elective'])) {
                    $linksRaw[] = [
                        'source' => $subjId,
                        'target' => $id,
                        'value'  => 1
                    ];
                }
            }

            saveJsonData($nodesFile, $nodes);
            saveJsonData($linksFile, $linksRaw);
            $msg = "Specializace '" . htmlspecialchars($id) . "' byla úspěšně uložena včetně vazeb a studijních požadavků.";
        }
        $action = 'list';
    } 
    
    elseif ($action === 'save_subj') {
        $id      = $_POST['id'] ?? '';
        $label   = $_POST['label'] ?? '';
        $specs   = is_array($_POST['specs'] ?? null) ? $_POST['specs'] : [];
        $credits = $_POST['credits'] ?? '';

        if (!validateId($id)) {
            $msg = "Chyba: Neplatné ID. Povolena jsou pouze písmena, čísla, pomlčky a podtržítka (max 64 znaků).";
            $action = 'list';
            goto end_post;
        }
        if (!validateLabel($label)) {
            $msg = "Chyba: Název musí být neprázdný řetězec do 200 znaků.";
            $action = 'list';
            goto end_post;
        }

        $mandatory_in = [];
        $elective_in = [];
        $pv_group = [];

        // Zpracování vztahů ze selectboxů — přijímáme pouze ID existujících specializací
        $valid_spec_ids = array_keys(array_filter($nodes, fn($n) => $n['group'] === 'spec'));
        foreach ($specs as $specId => $type) {
            if (!in_array($specId, $valid_spec_ids, true)) continue;
            if ($type === 'mandatory') $mandatory_in[] = $specId;
            if ($type === 'elective') {
                $elective_in[] = $specId;
                $chosenGroup = $_POST['specs_pvgroup'][$specId] ?? '';
                if ($chosenGroup !== '') {
                    $pv_group[$specId] = normalizeGroupKey($chosenGroup);
                }
            }
        }
        
        $shared_count = count($mandatory_in) + count($elective_in);
        if (!empty($mandatory_in) && empty($elective_in)) $course_type = 'mandatory';
        elseif (empty($mandatory_in) && !empty($elective_in)) $course_type = 'elective';
        elseif (empty($mandatory_in) && empty($elective_in)) $course_type = 'none';
        else $course_type = 'mixed';
        
        $nodes[$id] = [
            'id'           => $id,
            'label'        => $label,
            'group'        => 'subj',
            'radius'       => max(1, (int)$_POST['radius']),
            'shared_count' => $shared_count,
            'course_type'  => $course_type,
            'mandatory_in' => $mandatory_in,
            'elective_in'  => $elective_in,
            'credits'      => $credits !== '' ? max(0, (int)$credits) : 0
        ];
        if (!empty($pv_group)) {
            $nodes[$id]['pv_group'] = $pv_group;
        }
        
        // Obnova links.json pro tento předmět
        $linksRaw = array_filter($linksRaw, function($l) use ($id) {
            return $l['source'] !== $id;
        });
        
        $all_linked_specs = array_merge($mandatory_in, $elective_in);
        foreach ($all_linked_specs as $targetSpecId) {
            $linksRaw[] = [
                'source' => $id,
                'target' => $targetSpecId,
                'value'  => 1
            ];
        }
        
        saveJsonData($nodesFile, $nodes);
        saveJsonData($linksFile, $linksRaw);
        $msg = "Předmět '" . htmlspecialchars($id) . "' byl úspěšně uložen včetně vazeb.";
        $action = 'list';
    }
    end_post:
}

// --- MAZÁNÍ ---
if ($action === 'delete') {
    $del_id = $_GET['id'] ?? '';
    if (!validateId($del_id)) {
        $action = 'list';
        goto end_delete;
    }
    if (isset($nodes[$del_id])) {
        $isSpec = $nodes[$del_id]['group'] === 'spec';
        unset($nodes[$del_id]);
        
        if ($isSpec) {
            // Smažeme i navázaný program_req uzel
            $reqId = 'req_' . $del_id;
            if (isset($nodes[$reqId])) {
                unset($nodes[$reqId]);
            }

            foreach ($nodes as $nodeId => $node) {
                if ($node['group'] === 'subj') {
                    $nodes[$nodeId]['mandatory_in'] = array_values(array_diff($node['mandatory_in'] ?? [], [$del_id]));
                    $nodes[$nodeId]['elective_in'] = array_values(array_diff($node['elective_in'] ?? [], [$del_id]));
                    $nodes[$nodeId]['shared_count'] = count($nodes[$nodeId]['mandatory_in']) + count($nodes[$nodeId]['elective_in']);

                    if (isset($nodes[$nodeId]['pv_group'][$del_id])) {
                        unset($nodes[$nodeId]['pv_group'][$del_id]);
                        if (empty($nodes[$nodeId]['pv_group'])) {
                            unset($nodes[$nodeId]['pv_group']);
                        }
                    }
                    
                    if (!empty($nodes[$nodeId]['mandatory_in']) && empty($nodes[$nodeId]['elective_in'])) $nodes[$nodeId]['course_type'] = 'mandatory';
                    elseif (empty($nodes[$nodeId]['mandatory_in']) && !empty($nodes[$nodeId]['elective_in'])) $nodes[$nodeId]['course_type'] = 'elective';
                    elseif (empty($nodes[$nodeId]['mandatory_in']) && empty($nodes[$nodeId]['elective_in'])) $nodes[$nodeId]['course_type'] = 'none';
                    else $nodes[$nodeId]['course_type'] = 'mixed';
                }
            }
        }

        $linksRaw = array_filter($linksRaw, function($l) use ($del_id) {
            return $l['source'] !== $del_id && $l['target'] !== $del_id;
        });
        
        saveJsonData($nodesFile, $nodes);
        saveJsonData($linksFile, $linksRaw);
        $msg = "Uzel '" . htmlspecialchars($del_id) . "' a jeho vazby (včetně případných studijních požadavků) byly smazány.";
    }
    $action = 'list';
    end_delete:
}
?>

<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Správa grafu (Nodes & Links)</title>
    
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css">
  </head>
  <body class="bg-light">

  <div class="container my-5">
    
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3 mb-0 text-dark"><i class="bi bi-diagram-3-fill text-primary"></i> Správa grafu</h1>
        <?php if ($action !== 'list'): ?>
            <a href="?action=list" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Zpět na výpis</a>
        <?php endif; ?>
    </div>
    
    <?php if ($msg): ?>
        <div class="alert alert-success alert-dismissible fade show shadow-sm" role="alert">
            <i class="bi bi-check-circle-fill me-2"></i><?= htmlspecialchars($msg) ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    <?php endif; ?>

    <?php if ($action === 'list'): ?>
        
        <div class="card shadow-sm mb-4 border-0">
            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                <h2 class="h5 mb-0 text-secondary"><i class="bi bi-bookmark-star-fill text-warning"></i> Specializace</h2>
                <a href="?action=edit_spec" class="btn btn-success btn-sm"><i class="bi bi-plus-lg"></i> Nová specializace</a>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>Název</th>
                            <th>Typ studia</th>
                            <th>Barva</th>
                            <th>Radius</th>
                            <th>Kredity (celkem / povinné)</th>
                            <th class="text-end">Akce</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php foreach ($nodes as $node): if ($node['group'] !== 'spec') continue;
                        $req = findReqForSpec($nodes, $node['id']);
                    ?>
                        <tr>
                            <td><span class="badge bg-secondary"><?= htmlspecialchars($node['id']) ?></span></td>
                            <td class="fw-semibold"><?= htmlspecialchars($node['label']) ?></td>
                            <td>
                                <?php 
                                    $sType = $node['study_type'] ?? '';
                                    if ($sType === 'bakalarske') {
                                        echo '<span class="badge bg-success">Bakalářské</span>';
                                    } elseif ($sType === 'magisterske') {
                                        echo '<span class="badge bg-primary">Magisterské</span>';
                                    } else {
                                        echo '<span class="badge bg-light text-dark border">Nezadáno</span>';
                                    }
                                ?>
                            </td>
                            <td>
                                <span class="badge border shadow-sm" style="background-color: <?= htmlspecialchars($node['color']) ?>; color: #fff; text-shadow: 0 0 3px #000;">
                                    <?= htmlspecialchars($node['color']) ?>
                                </span>
                            </td>
                            <td><?= htmlspecialchars($node['radius'] ?? 40) ?></td>
                            <td>
                                <?php if ($req): ?>
                                    <span class="badge rounded-pill bg-info text-dark"><?= (int)$req['total_credits'] ?> / <?= (int)$req['mandatory_credits'] ?></span>
                                <?php else: ?>
                                    <span class="badge bg-light text-dark border">Nezadáno</span>
                                <?php endif; ?>
                            </td>
                            <td class="text-end">
                                <div class="btn-group" role="group">
                                    <a href="?action=edit_spec&id=<?= urlencode($node['id']) ?>" class="btn btn-outline-primary btn-sm" title="Upravit"><i class="bi bi-pencil-fill"></i></a> 
                                    <a href="?action=delete&id=<?= urlencode($node['id']) ?>" class="btn btn-outline-danger btn-sm" onclick="return confirm('Opravdu smazat? Smaže se i navázaný záznam studijních požadavků.')" title="Smazat"><i class="bi bi-trash-fill"></i></a>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card shadow-sm border-0">
            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                <h2 class="h5 mb-0 text-secondary"><i class="bi bi-journal-text text-info"></i> Předměty</h2>
                <a href="?action=edit_subj" class="btn btn-success btn-sm"><i class="bi bi-plus-lg"></i> Nový předmět</a>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>Název</th>
                            <th>Typ</th>
                            <th>Kredity</th>
                            <th>Sdíleno</th>
                            <th>Radius</th>
                            <th class="text-end">Akce</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php foreach ($nodes as $node): if ($node['group'] !== 'subj') continue; ?>
                        <tr>
                            <td><span class="badge bg-secondary"><?= htmlspecialchars($node['id']) ?></span></td>
                            <td class="fw-semibold"><?= htmlspecialchars($node['label']) ?></td>
                            <td>
                                <?php 
                                    if($node['course_type'] == 'mandatory') echo '<span class="badge bg-danger">Povinný</span>';
                                    elseif($node['course_type'] == 'elective') echo '<span class="badge bg-primary">Povinně volitelný</span>';
                                    elseif($node['course_type'] == 'mixed') echo '<span class="badge bg-warning text-dark">Smíšený</span>';
                                    else echo '<span class="badge bg-light text-dark border">Žádný</span>';
                                ?>
                            </td>
                            <td><span class="badge rounded-pill bg-secondary"><?= (int)($node['credits'] ?? 0) ?> kr.</span></td>
                            <td><span class="badge rounded-pill bg-info text-dark"><?= $node['shared_count'] ?? 0 ?>x</span></td>
                            <td><?= htmlspecialchars($node['radius'] ?? 12) ?></td>
                            <td class="text-end">
                                <div class="btn-group" role="group">
                                    <a href="?action=edit_subj&id=<?= urlencode($node['id']) ?>" class="btn btn-outline-primary btn-sm" title="Upravit"><i class="bi bi-pencil-fill"></i></a> 
                                    <a href="?action=delete&id=<?= urlencode($node['id']) ?>" class="btn btn-outline-danger btn-sm" onclick="return confirm('Opravdu smazat?')" title="Smazat"><i class="bi bi-trash-fill"></i></a>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

    <?php elseif ($action === 'edit_spec'): 
        $editNode = isset($_GET['id']) ? ($nodes[$_GET['id']] ?? null) : null;
        $specId = $editNode['id'] ?? '';
        $editReq = $specId ? findReqForSpec($nodes, $specId) : null;
        $existingPvGroups = $editReq['pv_groups'] ?? [];
        
        // Rozdělení předmětů pro vizuální oddělení
        $subj_mandatory = [];
        $subj_elective = [];
        $subj_none = [];

        foreach ($nodes as $subj) {
            if ($subj['group'] !== 'subj') continue;
            
            if ($specId && in_array($specId, $subj['mandatory_in'] ?? [])) {
                $subj_mandatory[] = $subj;
            } elseif ($specId && in_array($specId, $subj['elective_in'] ?? [])) {
                $subj_elective[] = $subj;
            } else {
                $subj_none[] = $subj;
            }
        }
    ?>
        <div class="card shadow-sm mx-auto border-0">
            <div class="card-header bg-white py-3">
                <h2 class="h5 mb-0"><?= $editNode ? '<i class="bi bi-pencil-square text-primary"></i> Úprava specializace' : '<i class="bi bi-plus-square text-success"></i> Nová specializace' ?></h2>
            </div>
            <div class="card-body">
                <form method="post" action="?action=save_spec" id="specForm">
                    
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">ID specializace <span class="text-muted fw-normal">(např. s8)</span></label>
                            <input type="text" name="id" class="form-control" value="<?= htmlspecialchars($editNode['id'] ?? '') ?>" required <?= $editNode ? 'readonly' : '' ?>>
                            <?php if($editNode): ?><div class="form-text text-danger"><i class="bi bi-exclamation-triangle"></i> ID nelze u existující položky měnit.</div><?php endif; ?>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Typ studia</label>
                            <select name="study_type" class="form-select" required>
                                <?php $currentStudyType = $editNode['study_type'] ?? 'bakalarske'; ?>
                                <option value="bakalarske" <?= $currentStudyType === 'bakalarske' ? 'selected' : '' ?>>Bakalářské</option>
                                <option value="magisterske" <?= $currentStudyType === 'magisterske' ? 'selected' : '' ?>>Magisterské</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <label class="form-label fw-bold">Název (label)</label>
                        <input type="text" name="label" class="form-control" value="<?= htmlspecialchars($editNode['label'] ?? '') ?>" required>
                    </div>

                    <div class="row mb-4">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Velikost uzlu (radius)</label>
                            <input type="number" name="radius" class="form-control" value="<?= htmlspecialchars($editNode['radius'] ?? 40) ?>" required min="1">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Barva</label>
                            <input type="color" name="color" class="form-control form-control-color w-100" value="<?= htmlspecialchars($editNode['color'] ?? '#ff6b6b') ?>" title="Vyberte barvu" required>
                        </div>
                    </div>

                    <hr class="my-4">
                    <h4 class="h5 mb-3"><i class="bi bi-clipboard-data text-secondary"></i> Studijní požadavky programu</h4>

                    <div class="row mb-3">
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Celkem kreditů</label>
                            <input type="number" name="total_credits" class="form-control" min="0" value="<?= htmlspecialchars($editReq['total_credits'] ?? 180) ?>">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Povinné kredity</label>
                            <input type="number" name="mandatory_credits" class="form-control" min="0" value="<?= htmlspecialchars($editReq['mandatory_credits'] ?? 0) ?>">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Min. povinně volitelných celkem</label>
                            <input type="number" name="pv_overall_min" class="form-control" min="0" value="<?= htmlspecialchars($editReq['pv_overall_min'] ?? 0) ?>">
                        </div>
                    </div>

                    <div class="mb-4">
                        <label class="form-label fw-bold d-block">Skupiny povinně volitelných předmětů (pv_groups)</label>
                        <div class="form-text mb-2">Klíč skupiny (číslo, nebo speciální hodnota jako <code>telocvik</code>) se používá i při přiřazování předmětů níže. Hodnota <code>doporucene</code> je vždy dostupná navíc a nemusí se zde definovat.</div>
                        <table class="table table-sm align-middle" id="pvGroupsTable">
                            <thead>
                                <tr>
                                    <th style="width:20%">Klíč skupiny</th>
                                    <th style="width:50%">Popisek</th>
                                    <th style="width:20%">Min. kreditů</th>
                                    <th style="width:10%"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($existingPvGroups as $g): ?>
                                <tr>
                                    <td><input type="text" name="pvg_key[]" class="form-control form-control-sm" value="<?= htmlspecialchars($g['group']) ?>" required></td>
                                    <td><input type="text" name="pvg_label[]" class="form-control form-control-sm" value="<?= htmlspecialchars($g['label'] ?? '') ?>"></td>
                                    <td><input type="number" name="pvg_min[]" class="form-control form-control-sm" min="0" value="<?= htmlspecialchars($g['min_credits'] ?? 0) ?>"></td>
                                    <td><button type="button" class="btn btn-outline-danger btn-sm removePvGroupRow"><i class="bi bi-trash"></i></button></td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="addPvGroupRow"><i class="bi bi-plus-lg"></i> Přidat skupinu</button>
                    </div>

                    <hr class="my-4">
                    <h4 class="h5 mb-3"><i class="bi bi-diagram-2 text-secondary"></i> Přiřazení předmětů ke specializaci</h4>
                    
                    <div class="card border-danger mb-3">
                        <div class="card-header bg-danger text-white py-2">
                            <h6 class="mb-0"><i class="bi bi-exclamation-circle-fill"></i> Aktuálně povinné předměty</h6>
                        </div>
                        <div class="card-body bg-light py-2">
                            <div class="row g-2">
                                <?php if (empty($subj_mandatory)): ?>
                                    <div class="col-12 text-muted fst-italic small">Žádné předměty nejsou přiřazeny jako povinné.</div>
                                <?php else: foreach ($subj_mandatory as $subj): ?>
                                    <div class="col-md-6">
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text w-50 text-truncate bg-white" title="<?= htmlspecialchars($subj['label']) ?>">
                                                <?= htmlspecialchars($subj['label']) ?>
                                            </span>
                                            <select name="subjects[<?= $subj['id'] ?>]" class="form-select border-danger subj-type-select" data-subj="<?= $subj['id'] ?>">
                                                <option value="mandatory" selected>Povinný</option>
                                                <option value="elective">Povinně volitelný</option>
                                                <option value="none">Odebrat vazbu</option>
                                            </select>
                                        </div>
                                    </div>
                                <?php endforeach; endif; ?>
                            </div>
                        </div>
                    </div>

                    <div class="card border-primary mb-3">
                        <div class="card-header bg-primary text-white py-2">
                            <h6 class="mb-0"><i class="bi bi-star-half"></i> Aktuálně povinně volitelné předměty</h6>
                        </div>
                        <div class="card-body bg-light py-2">
                            <div class="row g-2">
                                <?php if (empty($subj_elective)): ?>
                                    <div class="col-12 text-muted fst-italic small">Žádné předměty nejsou přiřazeny jako povinně volitelné.</div>
                                <?php else: foreach ($subj_elective as $subj): 
                                    $currentPvg = $subj['pv_group'][$specId] ?? '';
                                ?>
                                    <div class="col-md-6">
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text w-40 text-truncate bg-white" title="<?= htmlspecialchars($subj['label']) ?>">
                                                <?= htmlspecialchars($subj['label']) ?>
                                            </span>
                                            <select name="subjects[<?= $subj['id'] ?>]" class="form-select border-primary subj-type-select" data-subj="<?= $subj['id'] ?>">
                                                <option value="mandatory">Povinný</option>
                                                <option value="elective" selected>Povinně volitelný</option>
                                                <option value="none">Odebrat vazbu</option>
                                            </select>
                                            <select name="subjects_pvgroup[<?= $subj['id'] ?>]" class="form-select border-primary pvgroup-select" data-current="<?= htmlspecialchars($currentPvg) ?>">
                                                <!-- naplněno JS podle definovaných pv_groups -->
                                            </select>
                                        </div>
                                    </div>
                                <?php endforeach; endif; ?>
                            </div>
                        </div>
                    </div>

                    <div class="card border-secondary mb-4">
                        <div class="card-header bg-secondary text-white py-2">
                            <h6 class="mb-0"><i class="bi bi-dash-circle"></i> Ostatní nepřiřazené předměty</h6>
                        </div>
                        <div class="card-body bg-light py-2">
                            <div class="row g-2">
                                <?php if (empty($subj_none)): ?>
                                    <div class="col-12 text-muted fst-italic small">Všechny dostupné předměty jsou již přiřazeny k této specializaci.</div>
                                <?php else: foreach ($subj_none as $subj): ?>
                                    <div class="col-md-6">
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text w-40 text-truncate bg-white" title="<?= htmlspecialchars($subj['label']) ?>">
                                                <?= htmlspecialchars($subj['label']) ?>
                                            </span>
                                            <select name="subjects[<?= $subj['id'] ?>]" class="form-select border-secondary subj-type-select" data-subj="<?= $subj['id'] ?>">
                                                <option value="none" selected>Nepřiřazeno</option>
                                                <option value="mandatory">Přidat jako Povinný</option>
                                                <option value="elective">Přidat jako Povinně volitelný</option>
                                            </select>
                                            <select name="subjects_pvgroup[<?= $subj['id'] ?>]" class="form-select border-secondary pvgroup-select" data-current="" style="display:none;">
                                                <!-- naplněno JS podle definovaných pv_groups -->
                                            </select>
                                        </div>
                                    </div>
                                <?php endforeach; endif; ?>
                            </div>
                        </div>
                    </div>
                    
                    <div class="d-grid gap-2 d-md-flex justify-content-md-end pt-3 border-top">
                        <button type="submit" class="btn btn-primary"><i class="bi bi-save"></i> Uložit specializaci</button>
                        <a href="?action=list" class="btn btn-secondary"><i class="bi bi-x-circle"></i> Zrušit</a>
                    </div>
                </form>
            </div>
        </div>

        <script>
        (function() {
            var addBtn = document.getElementById('addPvGroupRow');
            var table = document.getElementById('pvGroupsTable').querySelector('tbody');

            function addRow(key, label, min) {
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td><input type="text" name="pvg_key[]" class="form-control form-control-sm" value="' + (key || '') + '" required></td>' +
                    '<td><input type="text" name="pvg_label[]" class="form-control form-control-sm" value="' + (label || '') + '"></td>' +
                    '<td><input type="number" name="pvg_min[]" class="form-control form-control-sm" min="0" value="' + (min || 0) + '"></td>' +
                    '<td><button type="button" class="btn btn-outline-danger btn-sm removePvGroupRow"><i class="bi bi-trash"></i></button></td>';
                table.appendChild(tr);
                bindRemove(tr.querySelector('.removePvGroupRow'));
                refreshPvGroupOptions();
            }

            function bindRemove(btn) {
                btn.addEventListener('click', function() {
                    btn.closest('tr').remove();
                    refreshPvGroupOptions();
                });
            }

            addBtn.addEventListener('click', function() {
                addRow('', '', 0);
            });

            table.querySelectorAll('.removePvGroupRow').forEach(bindRemove);

            // Sesbírá aktuálně definované skupiny z tabulky (klíč + popisek)
            function getDefinedGroups() {
                var groups = [];
                table.querySelectorAll('tr').forEach(function(tr) {
                    var keyInput = tr.querySelector('input[name="pvg_key[]"]');
                    var labelInput = tr.querySelector('input[name="pvg_label[]"]');
                    var key = keyInput ? keyInput.value.trim() : '';
                    if (key !== '') {
                        groups.push({ key: key, label: (labelInput && labelInput.value.trim()) || key });
                    }
                });
                return groups;
            }

            // Naplní všechny pvgroup-select prvky aktuálními skupinami + doporucene
            function refreshPvGroupOptions() {
                var groups = getDefinedGroups();
                document.querySelectorAll('.pvgroup-select').forEach(function(sel) {
                    var current = sel.getAttribute('data-current') || '';
                    var html = '<option value="">- bez skupiny -</option>';
                    groups.forEach(function(g) {
                        var sel_attr = (g.key === current) ? 'selected' : '';
                        html += '<option value="' + g.key + '" ' + sel_attr + '>' + g.label + '</option>';
                    });
                    var recSel = (current === 'doporucene') ? 'selected' : '';
                    html += '<option value="doporucene" ' + recSel + '>doporučené</option>';
                    sel.innerHTML = html;
                });
            }

            // Přepočítá viditelnost pv_group selectu podle zvoleného typu (mandatory/elective/none)
            function updateVisibility(typeSelect) {
                var row = typeSelect.closest('.input-group');
                var pvgSelect = row.querySelector('.pvgroup-select');
                if (!pvgSelect) return;
                pvgSelect.style.display = (typeSelect.value === 'elective') ? '' : 'none';
            }

            document.querySelectorAll('.subj-type-select').forEach(function(sel) {
                updateVisibility(sel);
                sel.addEventListener('change', function() {
                    updateVisibility(sel);
                });
            });

            // Přidat text vstupů pro popis skupiny na klíč "telocvik" apod. — refresh při psaní
            table.addEventListener('input', refreshPvGroupOptions);

            refreshPvGroupOptions();
        })();
        </script>

    <?php elseif ($action === 'edit_subj'): 
        $editNode = isset($_GET['id']) ? ($nodes[$_GET['id']] ?? null) : null;
        $mand_in = $editNode['mandatory_in'] ?? [];
        $elec_in = $editNode['elective_in'] ?? [];
        $pv_group_current = $editNode['pv_group'] ?? [];
    ?>
        <div class="card shadow-sm mx-auto border-0">
            <div class="card-header bg-white py-3">
                <h2 class="h5 mb-0"><?= $editNode ? '<i class="bi bi-pencil-square text-primary"></i> Úprava předmětu' : '<i class="bi bi-plus-square text-success"></i> Nový předmět' ?></h2>
            </div>
            <div class="card-body">
                <form method="post" action="?action=save_subj" id="subjForm">
                    <div class="row">
                        <div class="col-md-4 mb-3">
                            <label class="form-label fw-bold">ID předmětu / Kód <span class="text-muted fw-normal">(např. NPRG030)</span></label>
                            <input type="text" name="id" class="form-control" value="<?= htmlspecialchars($editNode['id'] ?? '') ?>" required <?= $editNode ? 'readonly' : '' ?>>
                            <?php if($editNode): ?><div class="form-text text-danger"><i class="bi bi-exclamation-triangle"></i> ID nelze u existující položky měnit.</div><?php endif; ?>
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label fw-bold">Velikost uzlu (radius)</label>
                            <input type="number" name="radius" class="form-control" value="<?= htmlspecialchars($editNode['radius'] ?? 12) ?>" required min="1">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label fw-bold">Kredity</label>
                            <input type="number" name="credits" class="form-control" value="<?= htmlspecialchars($editNode['credits'] ?? 0) ?>" min="0" required>
                        </div>
                    </div>

                    <div class="mb-4">
                        <label class="form-label fw-bold">Celý název (label)</label>
                        <input type="text" name="label" class="form-control" value="<?= htmlspecialchars($editNode['label'] ?? '') ?>" required>
                    </div>
                    
                    <div class="mb-4">
                        <label class="form-label fw-bold">Přiřazení ke specializacím:</label>
                        <div class="card bg-light border-0">
                            <div class="card-body">
                                <div class="row g-3">
                                    <?php 
                                    foreach ($nodes as $spec): 
                                        if ($spec['group'] !== 'spec') continue; 
                                        
                                        $currentType = 'none';
                                        if (in_array($spec['id'], $mand_in)) $currentType = 'mandatory';
                                        elseif (in_array($spec['id'], $elec_in)) $currentType = 'elective';

                                        $req = findReqForSpec($nodes, $spec['id']);
                                        $groupsForSpec = $req['pv_groups'] ?? [];
                                        $currentPvg = $pv_group_current[$spec['id']] ?? '';
                                    ?>
                                        <div class="col-md-6">
                                            <label class="form-label text-truncate w-100 mb-1" title="<?= htmlspecialchars($spec['label']) ?>">
                                                <span class="badge border shadow-sm me-1" style="background-color: <?= $spec['color'] ?>; color: transparent; width: 12px; height: 12px; display: inline-block;"></span>
                                                <?= htmlspecialchars($spec['label']) ?>
                                            </label>
                                            <div class="input-group input-group-sm">
                                                <select name="specs[<?= $spec['id'] ?>]" class="form-select form-select-sm spec-type-select <?= $currentType !== 'none' ? 'border-primary border-2' : '' ?>" data-spec="<?= $spec['id'] ?>">
                                                    <option value="none" <?= $currentType === 'none' ? 'selected' : '' ?>>- Žádná vazba -</option>
                                                    <option value="mandatory" <?= $currentType === 'mandatory' ? 'selected' : '' ?>>Povinný</option>
                                                    <option value="elective" <?= $currentType === 'elective' ? 'selected' : '' ?>>Povinně volitelný</option>
                                                </select>
                                                <select name="specs_pvgroup[<?= $spec['id'] ?>]" class="form-select form-select-sm spec-pvgroup-select" data-current="<?= htmlspecialchars($currentPvg) ?>" style="<?= $currentType === 'elective' ? '' : 'display:none;' ?>">
                                                    <option value="">- bez skupiny -</option>
                                                    <?php foreach ($groupsForSpec as $g): ?>
                                                        <option value="<?= htmlspecialchars($g['group']) ?>" <?= ((string)$g['group'] === (string)$currentPvg) ? 'selected' : '' ?>><?= htmlspecialchars($g['label'] ?? $g['group']) ?></option>
                                                    <?php endforeach; ?>
                                                    <option value="doporucene" <?= $currentPvg === 'doporucene' ? 'selected' : '' ?>>doporučené</option>
                                                </select>
                                            </div>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="d-grid gap-2 d-md-flex justify-content-md-end border-top pt-3">
                        <button type="submit" class="btn btn-primary"><i class="bi bi-save"></i> Uložit předmět</button>
                        <a href="?action=list" class="btn btn-secondary"><i class="bi bi-x-circle"></i> Zrušit</a>
                    </div>
                </form>
            </div>
        </div>

        <script>
        (function() {
            function updateVisibility(typeSelect) {
                var group = typeSelect.closest('.input-group');
                var pvgSelect = group.querySelector('.spec-pvgroup-select');
                if (!pvgSelect) return;
                pvgSelect.style.display = (typeSelect.value === 'elective') ? '' : 'none';
            }
            document.querySelectorAll('.spec-type-select').forEach(function(sel) {
                sel.addEventListener('change', function() { updateVisibility(sel); });
            });
        })();
        </script>
    <?php endif; ?>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
  </body>
</html>
