package kokko

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// RestoreArchive operates only on an OFFLINE data directory: no PocketBase
// instance is bootstrapped, no watcher or DB handle can observe a partial restore.
// Keep the replaced directory as a recovery copy; never silently delete it.
func RestoreArchive(dataDir, archivePath string) (string, error) {
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		return "", err
	}
	defer zr.Close()
	parent := filepath.Dir(dataDir)
	tmp, err := os.MkdirTemp(parent, ".kokko-restore-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp)
	var total uint64
	for _, f := range zr.File {
		if !filepath.IsLocal(f.Name) || f.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("unsafe backup path")
		}
		total += f.UncompressedSize64
		if total > 5<<30 {
			return "", errors.New("backup exceeds 5 GiB restore limit")
		}
		dest := filepath.Join(tmp, f.Name)
		if f.FileInfo().IsDir() {
			if err = os.MkdirAll(dest, 0700); err != nil {
				return "", err
			}
			continue
		}
		if err = os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
			return "", err
		}
		src, err := f.Open()
		if err != nil {
			return "", err
		}
		out, err := os.OpenFile(dest, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			src.Close()
			return "", err
		}
		_, copyErr := io.Copy(out, io.LimitReader(src, 5<<30))
		closeErr := out.Close()
		src.Close()
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	for _, name := range []string{"data.db", "auxiliary.db"} {
		info, err := os.Stat(filepath.Join(tmp, name))
		if err != nil || !info.Mode().IsRegular() {
			return "", fmt.Errorf("backup missing %s", name)
		}
	}
	old := dataDir + ".before-restore-" + time.Now().UTC().Format("20060102T150405.000000000")
	if err = os.Rename(dataDir, old); err != nil {
		return "", err
	}
	if err = os.Rename(tmp, dataDir); err != nil {
		_ = os.Rename(old, dataDir)
		return "", err
	}
	return old, nil
}
