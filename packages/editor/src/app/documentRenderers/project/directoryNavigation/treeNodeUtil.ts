export interface TreeNode {
  isDirectory: boolean;
  children: TreeNode[];
  fileName: string;
}
export interface File {
  fileName: string;
}

export function sortTreeItems(a: TreeNode, b: TreeNode) {
  if (a.isDirectory && !b.isDirectory) {
    return -1;
  } else if (b.isDirectory && !a.isDirectory) {
    return 1;
  }
  return a.fileName.localeCompare(b.fileName);
}

// https://stackoverflow.com/a/51012811/194651
export function filesToTreeNodes(arr: File[]): TreeNode[] {
  var tree: any = {};
  function addnode(obj: File) {
    var splitpath = obj.fileName.replace(/^\/|\/$/g, "").split("/");
    var ptr = tree;
    for (let i = 0; i < splitpath.length; i++) {
      let node: any = {
        fileName: splitpath[i],
        isDirectory: true,
      };
      if (i === splitpath.length - 1) {
        node.isDirectory = false;
      }
      ptr[splitpath[i]] = ptr[splitpath[i]] || node;
      ptr[splitpath[i]].children = ptr[splitpath[i]].children || {};
      ptr = ptr[splitpath[i]].children;
    }
  }
  function objectToArr(node: any) {
    Object.keys(node || {}).forEach((k) => {
      if (node[k].children) {
        objectToArr(node[k]);
      }
    });
    if (node.children) {
      node.children = Object.values(node.children);
      node.children.forEach(objectToArr);
      node.children.sort(sortTreeItems);
    }
  }
  arr.map(addnode);
  objectToArr(tree);
  const ret = Object.values(tree) as TreeNode[];
  ret.sort(sortTreeItems);
  return ret;
}
