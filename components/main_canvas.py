"""
The main album canvas

author: David den Uyl (ddenuyl@bebr.nl)
date: 2022-01-25
"""
from logging import debug
from pathlib import Path
from tkinter import Canvas
from components.container import Container


class MainCanvas(Canvas):
    """ Represents the main canvas in the application that holds the album """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.containers = []
        self.containers.append(Container(self, image_path=Path('data', 'ball.png')))
        self.containers.append(Container(self, image_path=Path('data', 'ball.png'), x=300, y=300))

        self.master.bind('a', lambda event: self.print_selected())
        self.bind('<Button-1>', self.deselect_all)

    def print_selected(self):
        debug(f"all selected: {self.find_withtag('selected')}")

    def deselect_all(self, e):
        """ remove selection from all objects on the canvas"""
        debug(f'event: {e}, '
              f'func: deselect_all, '
              f'deselecting ids: {self.find_withtag("selected")}')
        [self.delete(c) for c in self.find_withtag('to_delete')]
        [self.dtag(c, 'selected') for c in self.find_withtag('selected')]
