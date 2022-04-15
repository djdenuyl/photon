"""
Make object scalable

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-10
"""
from components.selection_arrow import SelectionArrow
from logging import debug
from pathlib import Path
from tkinter import SE, SW, NE, NW, S, W, N, E


class Scalable:
    """ A Scalable implements methods to scale a container. """
    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __init__(self, container):
        self.container = container
        self.canvas = self.container.canvas

        self.canvas.tag_bind(self.container.id, "<ButtonPress-1>", self.on_click, add='+')

    def on_click(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        no nothing if it is already selected """
        # if widget not selected, select it
        if 'selected' in self.canvas.gettags(self.container.id):
            self._draw_arrows()

        # debug statement
        debug(f'event: {event}, '
              f'func: select, '
              f'id: {self.container.id}, '
              f'tags: {self.canvas.gettags(self.container.id)}')

    def _draw_arrows(self):
        """ draws the resizing arrows around the bounding box. """
        # collect the window coords
        left, top, right, bottom = self.canvas.bbox(self.container.id)
        length = bottom - top
        width = right - left

        xs = [left + width / 2, left, left, left, right - width / 2, right, right, right]
        ys = [top, top, top + length / 2, bottom, bottom, bottom, bottom - length / 2, top]
        directions = [S, SE, E, NE, N, NW, W, SW]

        arrows = []
        rotation = 0
        for d, x, y in zip(directions, xs, ys):
            arrows.append(
                SelectionArrow(self.container, x, y, d, rotation)
            )

            rotation += 45
