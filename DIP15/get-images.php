<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$imageDir = 'images/BG/';
$allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
$images = [];

if (is_dir($imageDir)) {
    $files = scandir($imageDir);
    
    foreach ($files as $file) {
        if ($file != '.' && $file != '..') {
            $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (in_array($extension, $allowedExtensions)) {
                $images[] = $file;
            }
        }
    }
    
    // Sort images naturally
    natsort($images);
    $images = array_values($images);
}

echo json_encode($images);
?>
