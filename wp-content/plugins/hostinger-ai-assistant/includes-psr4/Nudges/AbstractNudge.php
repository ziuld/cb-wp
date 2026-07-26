<?php

namespace Hostinger\AiAssistant\Nudges;

use Hostinger\AiAssistant\Nudges\Dto\ReachOut;

if ( ! defined( 'ABSPATH' ) ) {
    die;
}

/**
 * Shared throttle, snooze and dismissal plumbing for nudges.
 *
 * Concrete nudges only implement {@see get_name()} and {@see evaluate()}; state
 * is namespaced per nudge via {@see get_name()} so multiple nudges never clash.
 */
abstract class AbstractNudge implements NudgeInterface {
    protected const THROTTLE_TTL = DAY_IN_SECONDS;
    protected const SHOWN_SNOOZE = 2 * DAY_IN_SECONDS;
    protected const MAX_SHOWS    = 3;
    protected const LONG_BACKOFF = 30 * DAY_IN_SECONDS;
    protected const DISMISS_TTL  = 7 * DAY_IN_SECONDS;

    abstract public function get_name(): string;

    abstract public function evaluate(): ?ReachOut;

    public function is_enabled(): bool {
        return true;
    }

    public function get_priority(): int {
        return 0;
    }

    public function is_throttled(): bool {
        return (bool) get_transient( $this->throttle_key() );
    }

    public function touch_throttle(): void {
        set_transient( $this->throttle_key(), 1, static::THROTTLE_TTL );
    }

    public function mark_sent( ReachOut $reach_out ): void {
        $this->record_shown( $reach_out->get_dedup_key() );
    }

    public function mark_dismissed(): void {
        update_option( $this->dismiss_key(), time() );
    }

    public function is_dismissed(): bool {
        $dismissed_at = (int) get_option( $this->dismiss_key(), 0 );

        return $dismissed_at > 0 && ( time() - $dismissed_at ) < static::DISMISS_TTL;
    }

    protected function can_show( string $dedup_key ): bool {
        $state = $this->get_shown_state();

        if ( $state['key'] !== $dedup_key ) {
            return true;
        }

        $elapsed = time() - $state['at'];

        if ( $state['count'] >= static::MAX_SHOWS ) {
            return $elapsed >= static::LONG_BACKOFF;
        }

        return $elapsed >= static::SHOWN_SNOOZE;
    }

    protected function record_shown( string $dedup_key ): void {
        $state = $this->get_shown_state();

        $new_cycle       = $state['key'] !== $dedup_key;
        $backoff_elapsed = $state['count'] >= static::MAX_SHOWS
            && ( time() - $state['at'] ) >= static::LONG_BACKOFF;

        $count = ( $new_cycle || $backoff_elapsed ) ? 0 : $state['count'];

        update_option(
            $this->state_key(),
            array(
                'key'   => $dedup_key,
                'count' => $count + 1,
                'at'    => time(),
            )
        );
    }

    protected function reset_state(): void {
        delete_option( $this->state_key() );
    }

    private function get_shown_state(): array {
        $state = get_option( $this->state_key(), array() );

        if ( ! is_array( $state ) ) {
            $state = array();
        }

        return array(
            'key'   => isset( $state['key'] ) ? (string) $state['key'] : '',
            'count' => isset( $state['count'] ) ? (int) $state['count'] : 0,
            'at'    => isset( $state['at'] ) ? (int) $state['at'] : 0,
        );
    }

    protected function throttle_key(): string {
        return 'hostinger_ai_nudge_' . $this->get_name() . '_checked';
    }

    protected function state_key(): string {
        return 'hostinger_ai_nudge_' . $this->get_name() . '_shown';
    }

    protected function dismiss_key(): string {
        return 'hostinger_ai_nudge_' . $this->get_name() . '_dismissed';
    }
}
