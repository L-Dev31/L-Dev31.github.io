<?php get_header(); ?>
    <!-- Start Main Section -->
    <main>
        <video id="circle-video" autoplay muted loop playsinline>
            <source src="<?php echo get_template_directory_uri(); ?>/images/bg.mp4" type="video/mp4">
        </video>
        <div id="video-overlay"></div>
        <div id="vignette-overlay"></div>
        <img src="<?php echo get_template_directory_uri(); ?>/images/logo-big.svg" alt="Logo" id="circle-logo">
    </main>
    <!-- End Main Section -->

    <!-- Start Scene 2 Section -->
    <section id="scene2">
        <div>
            <h1 class="slogan">Shine Bright</h1>
            <p class="description">Spécialistes de la musique, du son et de la lumière, nous mettons notre expertise au service de vos événements. De la conception lumière aux effets spéciaux, en passant par la sonorisation, nous créons des ambiances uniques et mémorables.</p>
        </div>
    </section>
    <!-- End Scene 2 Section -->
<?php get_footer(); ?>