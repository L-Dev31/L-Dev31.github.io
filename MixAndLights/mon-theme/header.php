<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mix And Lights</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo get_template_directory_uri() ; ?>/style.css" type="text/css" media="all" />
</head>
<body>
    <!-- Start Loader Section -->
    <div id="loader">
        <div id="counter">0%</div>
        <div id="completion-bar"></div>
    </div>
    <!-- End Loader Section -->

    <!-- Start Header Section -->
    <header>
        <div class="navbar-top-gradient"></div>
        <nav class="navbar navbar-expand-lg navbar-dark fixed-top">
            <div class="container">
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav me-auto">
                        <li class="nav-item">
                            <a class="nav-link" href="#">Accueil</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#">A propos</a>
                        </li>
                        <li class="nav-item dropdown">
                            <a class="nav-link dropdown-toggle" href="#" id="reservationDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                Reservation
                            </a>
                            <ul class="dropdown-menu" aria-labelledby="reservationDropdown">
                                <li><a class="dropdown-item" href="#">Services Particuliers</a></li>
                                <li><a class="dropdown-item" href="#">Services Professionels</a></li>
                            </ul>
                        </li>
                    </ul>
                </div>

                <a class="navbar-brand mx-auto" href="#">
                    <img src="images/logo-big.svg" alt="Logo">
                </a>

                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavRight" aria-controls="navbarNavRight" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>

                <div class="collapse navbar-collapse" id="navbarNavRight">
                     <ul class="navbar-nav ms-auto">
                        <li class="nav-item">
                            <a class="nav-link" href="#">Boutique</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#">Contact</a>
                        </li>
                        <li class="nav-item dropdown">
                            <a class="nav-link dropdown-toggle" href="#" id="langueDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                Langue
                            </a>
                            <ul class="dropdown-menu" aria-labelledby="langueDropdown">
                                <li><a class="dropdown-item" href="#"><img src="<?php echo get_template_directory_uri(); ?>/images/FlagFR.png" class="flag-icon" alt="French Flag">Français</a></li>
                                <li><a class="dropdown-item" href="#"><img src="<?php echo get_template_directory_uri(); ?>/images/FlagGB.png" class="flag-icon" alt="English Flag">Anglais</a></li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    </header>
    <!-- End Header Section -->