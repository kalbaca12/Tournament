<?php

namespace Tests\Unit;

use App\Support\SimplePdfDocument;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class SimplePdfDocumentTest extends TestCase
{
    #[Test]
    public function output_contains_pdf_structure_and_footer(): void
    {
        $document = new SimplePdfDocument();
        $document->addTitle('Hello');
        $document->addLine(str_repeat('Wrapped text ', 20));

        $pdf = $document->output();

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringContainsString('/Type /Pages', $pdf);
        self::assertStringContainsString('Page 1 / 1', $pdf);
    }

    #[Test]
    public function banner_stats_note_rule_and_bullet_list_are_rendered(): void
    {
        $document = new SimplePdfDocument();
        $document->addBanner('Tournament Export', 'Spring Cup', 'Single Elimination', ['Draft', '4 teams']);
        $document->addStatsGrid([
            ['label' => 'Teams', 'value' => '4', 'meta' => 'Approved teams'],
            ['label' => 'Matches', 'value' => '3', 'meta' => 'Scheduled games'],
        ], 2);
        $document->addSection('Setup Notes', 'Generated planning information');
        $document->addNoteBox('Participants must be locked before schedule generation.');
        $document->addBulletList(['Schedule ready', 'PDF ready']);
        $document->addRule();

        $pdf = $document->output();

        self::assertStringContainsString('Tournament Export', $pdf);
        self::assertStringContainsString('Spring Cup', $pdf);
        self::assertStringContainsString('Approved teams', $pdf);
        self::assertStringContainsString('Participants must be locked', $pdf);
        self::assertStringContainsString('Schedule ready', $pdf);
    }

    #[Test]
    public function table_renders_rows_footer_right_alignment_and_page_breaks(): void
    {
        $document = new SimplePdfDocument();
        $rows = [];
        for ($index = 1; $index <= 45; $index++) {
            $rows[] = [
                'team' => 'Team ' . $index,
                'points' => $index,
            ];
        }

        $document->addTable([
            ['key' => 'team', 'label' => 'Team'],
            ['key' => 'points', 'label' => 'Pts', 'width' => 50, 'align' => 'right'],
        ], $rows, [
            'footer' => ['team' => 'Total', 'points' => 1035],
        ]);

        $pdf = $document->output();

        self::assertStringContainsString('Team 1', $pdf);
        self::assertStringContainsString('Team 45', $pdf);
        self::assertStringContainsString('Total', $pdf);
        self::assertStringContainsString('Page 2 / 2', $pdf);
    }

    #[Test]
    public function bracket_diagram_renders_rounds_matches_statuses_and_winners(): void
    {
        $document = new SimplePdfDocument();
        $document->addBracketDiagram([
            [
                'title' => 'Semifinals',
                'matches' => [
                    [
                        'meta' => 'Match #1',
                        'status' => 'finished',
                        'top_label' => 'Wolves',
                        'top_score' => '81',
                        'top_winner' => true,
                        'bottom_label' => 'Falcons',
                        'bottom_score' => '77',
                        'footer' => '2026-04-18 18:30',
                    ],
                    [
                        'meta' => 'Match #2',
                        'status' => 'live',
                        'top_label' => 'Bulls',
                        'top_score' => '44',
                        'bottom_label' => 'Lions',
                        'bottom_score' => '42',
                        'footer' => '2026-04-18 20:30',
                    ],
                ],
            ],
            [
                'title' => 'Final',
                'matches' => [
                    [
                        'meta' => 'Match #3',
                        'status' => 'scheduled',
                        'top_label' => 'Winner of Semifinals 1',
                        'top_score' => '-',
                        'bottom_label' => 'Winner of Semifinals 2',
                        'bottom_score' => '-',
                        'footer' => '2026-04-20 18:30',
                    ],
                ],
            ],
        ]);

        $pdf = $document->output();

        self::assertStringContainsString('Semifinals', $pdf);
        self::assertStringContainsString('Match #1', $pdf);
        self::assertStringContainsString('Wolves', $pdf);
        self::assertStringContainsString('FINISHED', $pdf);
        self::assertStringContainsString('Final', $pdf);
    }

    #[Test]
    public function empty_structured_sections_are_ignored_and_manual_page_break_is_supported(): void
    {
        $document = new SimplePdfDocument();
        $document->addStatsGrid([]);
        $document->addTable([], [['value' => 'ignored']]);
        $document->addBracketDiagram([]);
        $document->addLine('');
        $document->newPage();
        $document->addLine('Second page content');

        $pdf = $document->output();

        self::assertStringContainsString('Second page content', $pdf);
        self::assertStringContainsString('Page 1 / 2', $pdf);
        self::assertStringContainsString('Page 2 / 2', $pdf);
    }
}
