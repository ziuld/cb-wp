<?php
/**
 * Plugin Name: CB Deploy Test Banner
 * Description: Visible marker used to verify the local -> develop -> dev.colibridge.es deploy cycle end to end.
 */

add_action( 'wp_footer', function () {
	echo '<p style="text-align:center;padding:8px;background:#f4f4f4;font-size:12px;margin:0;">Ciclo de despliegue verificado &#10003; &mdash; cb-wp-deploy-check</p>';
} );
