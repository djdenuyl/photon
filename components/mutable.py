""""
Parent class for any class that can perform a mutation on the container object, such as rotation, scaling etc
implements common methods

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-04-15
"""
from logging import debug


class Mutable:
    def __init__(self, container):
        self.container = container
        self.canvas = self.container.canvas

    @property
    def tags(self):
        """ get all the container tags"""
        return self.canvas.gettags(self.container.id)

    @property
    def bbox(self):
        """ get the container bbox """
        return self.canvas.bbox(self.container.id)

    @property
    def bbox_dict(self):
        """ get a dict of the CURRENT bbox of the container """
        l, t, r, b = self.bbox
        return {'l': l, 't': t, 'r': r, 'b': b}

    @property
    def dimensions(self):
        """ get the CURRENT dimensions of the container """
        l, t, r, b = self.bbox
        return r - l, b - t

    @property
    def container_anchor(self):
        """ get the CURRENT anchor for the container. NB. self.container.anchor gets the INITIAL anchor """
        return self.container.canvas.itemcget(self.container.id, "anchor")

    def _add_binding(self, button, function, _id=None):
        """ add a binding to the container """
        self.canvas.tag_bind(_id or self.container.id, button, function, add='+')

    def _add_tag(self, tag, _id=None):
        """ add a tag to _id, if _id is none adds the tag to the container"""
        self.canvas.addtag_withtag(tag, _id or self.container.id)

    def _remove_tag(self, tag, _id=None):
        """ remove a tag from _id, if _id is none removes the tag from the container"""
        self.canvas.dtag(_id or self.container.id, tag)

    def _tagged(self, tag):
        """" return the ids of all items with given tag """
        return self.canvas.find_withtag(tag)

    def _move(self, _id, dx, dy):
        """" move object with _id by dx, dy pixels"""
        self.canvas.move(_id, dx, dy)

    def _delete(self, _id):
        """" deletes obj _id, if _id is none deletes the container"""
        self.canvas.delete(_id)

    def _debug(self, event):
        """ log debug statement """
        debug(f'event: {event.type._name_}, '
              f'obj: {self.__class__.__name__}, '
              f'id: {self.container.id}, '
              f'tags: {self.tags}')
