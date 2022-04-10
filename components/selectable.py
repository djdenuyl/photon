"""
Make object selectable

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-01-30
"""
from logging import debug


class Selectable:
    def __init__(self, master, widget, window_id_id):
        self.master = master
        self.widget = widget
        self.window_id = window_id_id

        self.widget.bind("<ButtonPress-1>", self.on_click, add='+')
        self.widget.bind("<B1-Motion>", self.on_move, add='+')
        self.widget.bind("<ButtonRelease-1>", self.on_release, add='+')
        self.bbox_id = None

        self.has_moved = False

    def on_click(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        execute deselect function if it does have the 'selected' tag """
        # if widget already selected, deselect else select
        if 'selected' not in self.master.gettags(self.window_id):
            self.select()

        # debug statement
        debug(f'event: {event}, '
              f'func: select, '
              f'id: {self.window_id}, '
              f'tags: {self.master.gettags(self.window_id)}')

    def on_move(self, event):
        self.has_moved = True

    def on_release(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        execute deselect function if it does have the 'selected' tag """
        # if widget already selected, deselect else select
        if 'selection_event' in self.master.gettags(self.window_id):
            self.master.dtag(self.window_id, 'selection_event')
        elif 'selected' in self.master.gettags(self.window_id) \
                and not self.has_moved:
            self.deselect()

        self.has_moved = False

        # debug statement
        debug(f'event: {event}, '
              f'func: select, '
              f'id: {self.window_id}, '
              f'tags: {self.master.gettags(self.window_id)}')

    def select(self):
        """ finds the ids of currently selected items on the canvas and deselects those if they exist.
        Draws a bbox around the currently selected item and adds selected tags to the item and its bbox """

        # deselect any already selected widget
        currently_selected = self.master.find_withtag('selected')
        if currently_selected is not None:
            for c in currently_selected:
                self.deselect(c)

        # draw the bbox around the selected widget
        self.bbox_id = self.master.create_rectangle(*self.master.bbox(self.window_id), width=2)

        # add 'selected' tag to selected item and its bbox
        self.master.itemconfig(self.window_id, tags=['selected', 'selection_event'])
        self.master.itemconfig(self.bbox_id, tags=['bbox', 'selected'])

    def deselect(self, other=None):
        """ deselects the objects if other is none else deselects the other object
        Also removes the bbox """
        self.master.delete(self.master.find_withtag('bbox') or self.bbox_id)
        self.master.dtag(other or self.window_id, 'selected')
